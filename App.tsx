import React, { useState, useCallback, useRef, useMemo } from 'react';
import { GoogleGenAI } from '@google/genai';
import { UploadIcon, FileAudioIcon, XCircleIcon, ClipboardIcon, CheckIcon } from './components/Icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';


type Status = 'idle' | 'uploading' | 'transcribing' | 'error';
type PromptStatus = 'idle' | 'loading' | 'error';

const LESSON_GENERATION_SYSTEM_PROMPT = `**Role:** You are acting as a highly experienced Artificial Intelligence (AI) and Software Testing Expert who has vast knowledge in Generative AI tools and their application in the software development lifecycle.

**Goal:** Your task is to transform the provided video transcript/text into a clear, comprehensive, and engaging lesson content for an educational course.

**Instruction Guidelines:**
1.  **Maintain Expert Tone:** Write the content in an **accessible, clear, and professional** tone, suitable for a course covering technical subjects related to AI and testing.
2.  **Adherence to Source:** The core content must be **strictly based on the information provided in the input text/transcript**. Do not invent main topics.
3.  **Enhancement for Clarity:** To enhance understanding and provide practical context, you are **encouraged to introduce short, relevant examples, analogies, or brief supplementary explanations** that support and elaborate on the points made in the transcript. These additions must be concise and directly related to the topic.
4.  **Language Output:** You must deliver the final lesson content **entirely in Turkish (Türkçe)**, ensuring the translation is natural and high-quality.
5.  **Target Audience:** The content is intended for professionals and students seeking to understand how to effectively integrate AI into their testing and development processes.

**Structure Template for Output:**
The final Turkish output must follow this structured template for every lesson:

### 🇹🇷 Ders İçeriği Başlığı (Lesson Content Title)

**I. Giriş ve Konuya Genel Bakış (Introduction and Overview)**
* Bu dersin temel amacı ve hedefleri.
* Konunun genel AI/Test sürecindeki yeri.

**II. Temel Kavramlar ve Tanımlar (Core Concepts and Definitions)**
* Konunun anahtar terimlerinin net ve anlaşılır tanımları.
* Transkriptteki ana fikirlerin özetlenmesi.

**III. Detaylı Anlatım ve Uygulamalar (Detailed Explanation and Applications)**
* Transkriptteki adımların veya detaylı açıklamaların madde madde veya paragraflar halinde sunulması.
* **[Kısa Örnek/Analoji Eklenecek Bölüm]** (Insert short, relevant example or analogy here to improve comprehension.)

**IV. Uzman Görüşü ve Pratik İpuçları (Expert Insight and Practical Tips)**
* Konuyla ilgili uzmanın deneyimlerinden damıtılmış kısa bir ipucu veya dikkat edilmesi gereken bir nokta.

**V. Özet ve Sonuç (Summary and Conclusion)**
* Dersin en önemli çıkarımlarının 2-3 madde ile özetlenmesi.`;


const formatFileSize = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

const App: React.FC = () => {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [transcription, setTranscription] = useState<string>('');
    const [status, setStatus] = useState<Status>('idle');
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState<boolean>(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // State for follow-up prompts
    const [prompt, setPrompt] = useState<string>('');
    const [promptResponse, setPromptResponse] = useState<string>('');
    const [promptStatus, setPromptStatus] = useState<PromptStatus>('idle');
    const [promptError, setPromptError] = useState<string | null>(null);
    const [promptCopied, setPromptCopied] = useState<boolean>(false);

    const ai = useMemo(() => {
        const apiKey = process.env.API_KEY;
        if (!apiKey) return null;
        return new GoogleGenAI({ apiKey });
    }, []);

    const resetPromptState = useCallback(() => {
        setPrompt('');
        setPromptResponse('');
        setPromptError(null);
        setPromptStatus('idle');
        setPromptCopied(false);
    }, []);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setError(null);
            setTranscription('');
            setSelectedFile(file);
            setStatus('idle');
            resetPromptState();
        }
    };
    
    const handleFileDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        const file = event.dataTransfer.files?.[0];
        if (file) {
            setError(null);
            setTranscription('');
            setSelectedFile(file);
            setStatus('idle');
            resetPromptState();
        }
    };

    const removeFile = () => {
        setSelectedFile(null);
        setTranscription('');
        setStatus('idle');
        setCopied(false);
        resetPromptState();
        if(fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    }

    const handleCopy = () => {
        if (!transcription) return;
        navigator.clipboard.writeText(transcription);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500); // Reset after 2.5 seconds
    };

    const handlePromptCopy = () => {
        if (!promptResponse) return;
        navigator.clipboard.writeText(promptResponse);
        setPromptCopied(true);
        setTimeout(() => setPromptCopied(false), 2500);
    };

    const handleTranscribe = useCallback(async () => {
        if (!selectedFile) {
            setError("Please select an audio file first.");
            return;
        }
        if (!ai) {
            setError("API key is not configured. Please set the API_KEY environment variable.");
            return;
        }

        setStatus('uploading');
        setError(null);
        setTranscription('');
        setCopied(false);
        resetPromptState();
        
        try {
            // 1. Upload the file to the File API. The SDK handles polling.
            const uploadedFile = await ai.files.upload({
                file: selectedFile,
            });

            if (!uploadedFile) {
                throw new Error("File upload failed: The API did not return a file object.");
            }
            
            // 2. Transcribe the file by passing the file object directly.
            // Gemini will wait for the file to be processed automatically.
            setStatus('transcribing');
            const audioPart = {
                fileData: {
                    mimeType: uploadedFile.mimeType,
                    fileUri: uploadedFile.uri,
                },
            };

            const textPart = {
                text: "Transcribe this long audio recording in its entirety. Provide a high-quality, accurate transcript of all speech.",
            };

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-pro',
                contents: { parts: [textPart, audioPart] },
            });

            const resultText = response.text;
            if (resultText) {
                setTranscription(resultText);
            } else {
                setError("Could not get a transcription. The response was empty.");
            }
            setStatus('idle');

        } catch (err: any) {
            console.error(err);
            setError(`An error occurred: ${err.message}. If you are uploading a large file, please ensure you have a stable internet connection.`);
            setStatus('error');
        }
    }, [selectedFile, resetPromptState, ai]);
    
    const handlePromptSubmit = useCallback(async () => {
        if (!prompt.trim() || !transcription) {
            setPromptError("Lütfen bir talimat veya başlık girin.");
            return;
        }

        if (!ai) {
            setPromptError("API anahtarı yapılandırılmamış.");
            return;
        }

        setPromptStatus('loading');
        setPromptError(null);
        setPromptResponse('');
        setPromptCopied(false);

        try {
            const userPromptContents = `Lütfen aşağıdaki transkripte göre ders içeriğini oluşturun.

--- TRANSKRİPT ---
${transcription}

--- KULLANICI TALİMATLARI / DERS BAŞLIĞI ---
${prompt}
`;

            const responseStream = await ai.models.generateContentStream({
                model: 'gemini-2.5-pro',
                contents: userPromptContents,
                config: {
                    systemInstruction: LESSON_GENERATION_SYSTEM_PROMPT,
                }
            });

            for await (const chunk of responseStream) {
                setPromptResponse(prev => prev + chunk.text);
            }
            
            setPromptStatus('idle');

        } catch (err: any) {
            console.error(err);
            setPromptError(`Bir hata oluştu: ${err.message}`);
            setPromptStatus('error');
        }
    }, [prompt, transcription, ai]);

    const isProcessing = ['uploading', 'transcribing'].includes(status);

    const getButtonText = () => {
        switch (status) {
            case 'uploading':
                return `Uploading & Processing...`;
            case 'transcribing':
                return 'Transcribing...';
            default:
                return 'Transcribe Audio';
        }
    };


    return (
        <div className="min-h-screen bg-gray-900 text-gray-200 flex flex-col font-sans">
            <header className="p-4 border-b border-gray-700 shadow-lg">
                <h1 className="text-2xl font-bold text-center text-cyan-400">Gemini Large Audio Transcriber</h1>
                <p className="text-center text-gray-400">Upload a large audio file to generate a transcript and ask questions about it.</p>
            </header>

            <main className="flex-grow flex flex-col items-center justify-center p-4 md:p-6 space-y-6">
                
                <div 
                    className="w-full max-w-2xl"
                    onDragOver={(e) => {e.preventDefault(); e.stopPropagation();}}
                    onDrop={handleFileDrop}
                >
                    {!selectedFile ? (
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-600 rounded-lg cursor-pointer bg-gray-800 hover:bg-gray-700/50 transition-colors"
                        >
                            <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
                                <UploadIcon />
                                <p className="mb-2 text-sm text-gray-400"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                                <p className="text-xs text-gray-500">MP3, WAV, M4A, etc. (Large files supported)</p>
                                <p className="text-xs text-gray-500 mt-1">To transcribe a YouTube video, download its audio first.</p>
                            </div>
                            <input ref={fileInputRef} id="dropzone-file" type="file" className="hidden" onChange={handleFileChange} accept="audio/*" />
                        </div>
                    ) : (
                        <div className="w-full p-4 border border-gray-700 rounded-lg bg-gray-800 flex items-center justify-between">
                            <div className="flex items-center space-x-3 overflow-hidden">
                                <FileAudioIcon />
                                <div className="flex flex-col overflow-hidden">
                                    <span className="text-sm font-medium text-gray-200 truncate">{selectedFile.name}</span>
                                    <span className="text-xs text-gray-400">{formatFileSize(selectedFile.size)}</span>
                                </div>
                            </div>
                            <button onClick={removeFile} className="p-1 text-gray-400 hover:text-white rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-cyan-500">
                                <XCircleIcon />
                            </button>
                        </div>
                    )}
                </div>

                {status === 'uploading' && (
                    <div className="w-full max-w-2xl -my-4 text-center">
                        <div className="w-full bg-gray-700 rounded-full h-2.5 overflow-hidden">
                            <div 
                                className="bg-cyan-500 h-2.5 rounded-full animate-pulse"
                            ></div>
                        </div>
                         <p className="text-sm text-gray-400 mt-2">Uploading file... This can take several minutes for large files.</p>
                    </div>
                )}
                
                <button
                    onClick={handleTranscribe}
                    disabled={!selectedFile || isProcessing}
                    className="flex items-center justify-center px-8 py-3 rounded-full text-white font-semibold 
                               transition-all duration-300 ease-in-out shadow-lg focus:outline-none focus:ring-4 focus:ring-cyan-500/50
                               bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
                >
                    {isProcessing ? (
                        <>
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            {getButtonText()}
                        </>
                    ) : (
                        getButtonText()
                    )}
                </button>
                
                {error && (
                    <div className="text-red-400 bg-red-900/50 p-3 rounded-md text-center max-w-2xl w-full">
                        <p><strong>Error:</strong> {error}</p>
                    </div>
                )}
                
                {transcription && (
                     <div className="w-full max-w-2xl bg-gray-800 rounded-lg p-4 mt-4 border border-gray-700 shadow-inner">
                        <div className="flex justify-between items-center mb-2">
                             <h2 className="text-lg font-semibold text-cyan-400">Transcription Result:</h2>
                             <button 
                                onClick={handleCopy}
                                className="flex items-center space-x-2 px-3 py-1.5 text-sm rounded-md font-medium transition-colors
                                           bg-gray-700 text-gray-300 hover:bg-gray-600 focus:outline-none focus:ring-2 
                                           focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-cyan-500"
                            >
                                {copied ? <CheckIcon /> : <ClipboardIcon />}
                                <span>{copied ? 'Copied!' : 'Copy'}</span>
                             </button>
                        </div>
                        <div className="max-h-60 overflow-y-auto bg-gray-900/50 p-2 rounded-md border border-gray-700">
                           <p className="text-gray-300 whitespace-pre-wrap font-mono text-sm">{transcription}</p>
                        </div>
                    </div>
                )}

                {transcription && (
                    <div className="w-full max-w-2xl space-y-4">
                        <div className="w-full bg-gray-800 rounded-lg p-4 border border-gray-700">
                            <h2 className="text-lg font-semibold text-teal-400 mb-3">Transkriptten Ders İçeriği Oluştur</h2>
                            <textarea
                                className="w-full p-2 bg-gray-900 border border-gray-600 rounded-md focus:ring-2 focus:ring-teal-500 focus:outline-none transition-colors"
                                rows={3}
                                placeholder="Örn: 'Yapay Zeka ile Test Otomasyonu' için bir ders oluşturun veya ders için özel talimatlar girin."
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                disabled={promptStatus === 'loading'}
                                aria-label="Ask a question about the transcript"
                            />
                            <button
                                onClick={handlePromptSubmit}
                                disabled={!prompt.trim() || promptStatus === 'loading'}
                                className="mt-3 flex items-center justify-center px-6 py-2 rounded-full text-white font-semibold 
                                           transition-all duration-300 ease-in-out shadow-lg focus:outline-none focus:ring-4 focus:ring-teal-500/50
                                           bg-teal-600 hover:bg-teal-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
                            >
                                {promptStatus === 'loading' ? (
                                    <>
                                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        <span>Oluşturuluyor...</span>
                                    </>
                                ) : (
                                    <span>Ders Oluştur</span>
                                )}
                            </button>
                        </div>

                        {promptError && (
                            <div className="text-red-400 bg-red-900/50 p-3 rounded-md text-center w-full">
                                <p><strong>Error:</strong> {promptError}</p>
                            </div>
                        )}

                        {(promptResponse || promptStatus === 'loading') && (
                            <div className="w-full bg-gray-800 rounded-lg p-4 border border-gray-700 shadow-inner prose prose-invert prose-p:text-gray-300 prose-headings:text-teal-400 max-w-none">
                                <div className="flex justify-between items-center mb-2 not-prose">
                                    <h2 className="text-lg font-semibold text-teal-400">Oluşturulan Ders İçeriği:</h2>
                                    <button 
                                        onClick={handlePromptCopy}
                                        className="flex items-center space-x-2 px-3 py-1.5 text-sm rounded-md font-medium transition-colors
                                                   bg-gray-700 text-gray-300 hover:bg-gray-600 focus:outline-none focus:ring-2 
                                                   focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-teal-500"
                                    >
                                        {promptCopied ? <CheckIcon /> : <ClipboardIcon />}
                                        <span>{promptCopied ? 'Copied!' : 'Copy'}</span>
                                    </button>
                                </div>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{promptResponse}</ReactMarkdown>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
};

export default App;
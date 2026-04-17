/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Camera, RefreshCw, Star, Sun, CloudRain, Snowflake, Thermometer, Mic, Volume2, Sparkles, MessageCircle, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeOutfit, getMotivationalQuote, generateSpeech, AnalysisResult } from './lib/gemini';
import { initHandDetection, isHandOpen, isHandClosed } from './lib/gesture';
import { HandLandmarker } from '@mediapipe/tasks-vision';

const WEATHER_TYPES = [
  { id: 'sunny', icon: Sun, label: 'مشمس', color: 'text-yellow-400' },
  { id: 'cloudy', icon: Sun, label: 'غائم', color: 'text-slate-400' },
  { id: 'rainy', icon: CloudRain, label: 'ماطر', color: 'text-blue-400' },
  { id: 'cold', icon: Snowflake, label: 'بارد', color: 'text-cyan-300' },
  { id: 'hot', icon: Thermometer, label: 'حار', color: 'text-orange-500' },
];

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [weather, setWeather] = useState('sunny');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [quote, setQuote] = useState<string>('ابدأ يومك بابتسامة...');
  const [isStarted, setIsStarted] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const handStateRef = useRef<'idle' | 'open' | 'cooldown'>('idle');
  const lastStateChangeRef = useRef<number>(0);

  // Initialize AudioContext on first interaction
  const initAudio = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
  };

  // Initialize camera
  const startCamera = async () => {
    setIsStarted(true);
    initAudio();
    
    // Initialize hand detection
    try {
      handLandmarkerRef.current = await initHandDetection();
    } catch (e) {
      console.error("Hand detection init failed:", e);
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } 
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setIsCameraReady(true);
    } catch (err) {
      console.error("Error accessing camera:", err);
    }
  };

  useEffect(() => {
    fetchNewQuote();
    
    // Detection loop
    let animationId: number;
    const detectHand = async () => {
      if (
        handLandmarkerRef.current && 
        videoRef.current && 
        isCameraReady && 
        !capturedImage && 
        !isAnalyzing &&
        videoRef.current.readyState >= 2 && // HAVE_CURRENT_DATA or better
        videoRef.current.videoWidth > 0 &&
        videoRef.current.videoHeight > 0
      ) {
        try {
          const results = handLandmarkerRef.current.detectForVideo(videoRef.current, performance.now());
          
          if (results.landmarks && results.handedness) {
          // Look for right hand
          // Note: In mirrored view, handedness might be confusing, but we'll check both for simplicity 
          // or just pick the most prominent one if the user is likely using their dominant right hand.
          // Usually results.handedness[0].categoryName is "Right" or "Left".
          
          for (let i = 0; i < results.landmarks.length; i++) {
            const landmarks = results.landmarks[i];
            const handedness = results.handedness[i][0].categoryName;
            
            // User requested "Main droite" (Right hand)
            // If the camera is user-facing, the user's right hand is on the right side of the Mirror view.
            // Mediapipe labels "Left" the hand that looks like Left in the frame.
            // In a mirror, your Right hand LOOKS like a Right hand in the mirror.
            // So we look for "Right".
            if (handedness === 'Right') {
              const now = Date.now();
              const open = isHandOpen(landmarks);
              const closed = isHandClosed(landmarks);

              if (handStateRef.current === 'idle' && open) {
                handStateRef.current = 'open';
                lastStateChangeRef.current = now;
              } else if (handStateRef.current === 'open' && closed && (now - lastStateChangeRef.current > 300)) {
                // Trigger analysis with a slight delay to allow lowering the hand
                handStateRef.current = 'cooldown';
                lastStateChangeRef.current = now;
                setTimeout(() => {
                  takePhoto();
                }, 500);
              } else if (handStateRef.current === 'cooldown' && (now - lastStateChangeRef.current > 2500)) {
                handStateRef.current = 'idle';
              }
            }
          }
        }
      } catch (error) {
        console.error("MediaPipe detection loop error:", error);
      }
    }
    animationId = requestAnimationFrame(detectHand);
  };
    detectHand();

    // Prime Speech Synthesis voices
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }

    return () => {
      cancelAnimationFrame(animationId);
      stream?.getTracks().forEach(track => track.stop());
    };
  }, [isCameraReady, capturedImage, isAnalyzing]);

  const fetchNewQuote = async () => {
    const q = await getMotivationalQuote();
    setQuote(q);
  };

  const takePhoto = () => {
    initAudio();

    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        // Flip image horizontally for natural mirror feel
        context.translate(canvasRef.current.width, 0);
        context.scale(-1, 1);
        context.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvasRef.current.toDataURL('image/jpeg');
        setCapturedImage(dataUrl);
        handleAnalysis(dataUrl);
      }
    }
  };

  const handleAnalysis = async (imageData: string) => {
    setIsAnalyzing(true);
    setResult(null);
    const weatherLabel = WEATHER_TYPES.find(w => w.id === weather)?.label || 'مشمس';
    const analysis = await analyzeOutfit(imageData, weatherLabel);
    setResult(analysis);
    setIsAnalyzing(false);
    
    // Auto-read feedback
    speak(analysis.feedback + ". " + analysis.advice);
  };

  const speak = async (text: string) => {
    setIsReading(true);
    
    try {
      const base64Audio = await generateSpeech(text);
      if (!base64Audio) throw new Error("No audio data received");

      if (!audioContextRef.current) initAudio();
      const ctx = audioContextRef.current!;
      
      // Decode Base64
      const binaryString = atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Convert PCM 16-bit to Float32
      const pcm16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768.0;
      }
      
      // Create AudioBuffer
      const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);
      
      // Play
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      
      source.onended = () => setIsReading(false);
      source.start();
    } catch (error) {
      console.error("TTS Error:", error);
      setIsReading(false);
      
      // Fallback to browser synthesis if Gemini TTS fails
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ar-SA';
        utterance.onstart = () => setIsReading(true);
        utterance.onend = () => setIsReading(false);
        window.speechSynthesis.speak(utterance);
      }
    }
  };

  const reset = () => {
    setCapturedImage(null);
    setResult(null);
    fetchNewQuote();
  };

  return (
    <div className="fixed inset-0 bg-black text-white font-sans selection:bg-slate-700/50 overflow-hidden flex items-center justify-center" dir="rtl">
      {/* Mirror Reflection Background Effect */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(40,44,52,0.15)_0%,_rgba(0,0,0,0.8)_100%)]" />
      </div>

      <div className="relative z-10 w-full h-full flex flex-col items-center justify-between p-4 md:p-8">
        {/* Mirror Area */}
        <div className="flex-grow w-full flex items-center justify-center min-h-0">
          <motion.div 
            layout
            className="relative w-full h-full max-w-4xl rounded-[40px] md:rounded-[60px] overflow-hidden border border-white/10 ring-1 ring-white/5 shadow-[0_0_80px_rgba(0,0,0,0.8)] bg-[#050505]"
          >
            {/* Start Screen / Logo Area */}
            {!isStarted ? (
              <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0a0a0c]">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center gap-10"
                >
                  <div className="relative">
                    <div className="w-32 h-32 rounded-full border border-white/10 flex items-center justify-center bg-white/5 backdrop-blur-3xl">
                      <Sparkles className="w-12 h-12 text-[#d4af37]" />
                    </div>
                    <div className="absolute inset-0 rounded-full border border-[#d4af37]/20 animate-pulse scale-125" />
                  </div>
                  
                  <div className="text-center space-y-2">
                    <h2 className="text-4xl font-bold font-cairo text-white tracking-[8px]">مرايا</h2>
                    <p className="text-[#a0a0a0] font-cairo text-sm uppercase tracking-[4px]">ذكاء اصطناعي يعزز أناقتك</p>
                  </div>
                </motion.div>
              </div>
            ) : null}

            {/* Camera Stream */}
            {!capturedImage ? (
              <div className="relative w-full h-full">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover camera-flip transition-opacity duration-700"
                />
                
                {!isCameraReady && isStarted && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/90 backdrop-blur-md z-10">
                    <div className="flex flex-col items-center gap-6">
                      <RefreshCw className="w-12 h-12 animate-spin text-[#d4af37]" />
                      <p className="text-slate-500 font-cairo tracking-[4px] uppercase text-xs">جاري الربط مع مرايا...</p>
                    </div>
                  </div>
                )}
                
                {/* Decorative Mirror Overlays */}
                <div className="absolute inset-0 mirror-gradient pointer-events-none opacity-40" />
                <div className="absolute inset-[4%] border border-white/5 rounded-[50px] pointer-events-none" />
                
                {/* Analysis Scanner Line (Animated) */}
                <div className="scan-line top-1/4 left-1/2 -translate-x-1/2 animate-[scan_4s_ease-in-out_infinite]" />
                
                {/* Gesture Hint */}
                <div className="absolute top-8 right-8 flex flex-col items-end gap-2 pointer-events-none opacity-50 bg-black/20 backdrop-blur-md p-3 rounded-2xl border border-white/5">
                  <div className="flex gap-2 items-center">
                    <span className="text-[10px] font-cairo text-white uppercase tracking-widest text-right leading-tight">
                      لوّح بيدك اليمنى<br/>(مفتحوحة ثم مغلقة)<br/>بعد 0.5 ثانية سيتم التحليل
                    </span>
                    <Sparkles className="w-4 h-4 text-[#d4af37]" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative w-full h-full">
                <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" />
                
                <AnimatePresence>
                  {isAnalyzing ? (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xl z-20"
                    >
                      <div className="relative mb-8">
                        <RefreshCw className="w-20 h-20 animate-spin text-[#d4af37]" />
                        <Sparkles className="absolute -top-4 -right-4 w-10 h-10 text-[#d4af37] animate-pulse" />
                      </div>
                      <motion.div
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="text-center"
                      >
                        <h3 className="text-3xl font-bold font-cairo text-white tracking-widest mb-2">جاري قراءة حضورك...</h3>
                      </motion.div>
                    </motion.div>
                  ) : (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none"
                    >
                      {/* Visual pulse indicator of voice feedback */}
                      <div className="relative">
                        <div className={`w-32 h-32 rounded-full border-2 border-[#d4af37] flex items-center justify-center ${isReading ? 'animate-pulse scale-125' : ''}`}>
                           <Volume2 className={`w-12 h-12 text-[#d4af37] ${isReading ? 'animate-bounce' : ''}`} />
                        </div>
                        {isReading && (
                          <>
                            <div className="absolute inset-0 rounded-full border-2 border-[#d4af37]/30 animate-ping" />
                            <div className="absolute inset-[-20px] rounded-full border border-[#d4af37]/10 animate-ping [animation-delay:0.5s]" />
                          </>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        </div>

        {/* Action Button Area (Under Camera) */}
        <div className="flex-shrink-0 pt-8 pb-4 w-full flex justify-center">
          {!isStarted ? (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={startCamera}
              className="group relative px-20 py-6 bg-white text-black rounded-full font-bold font-cairo uppercase tracking-[8px] overflow-hidden transition-all hover:bg-[#d4af37] hover:text-white shadow-2xl"
            >
              <span className="relative z-10">تشغيل المرآة</span>
              <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </motion.button>
          ) : !capturedImage ? (
            <motion.button
              whileHover={{ scale: 1.1, boxShadow: '0 0 40px rgba(212,175,55,0.4)' }}
              whileTap={{ scale: 0.9 }}
              onClick={takePhoto}
              disabled={!isCameraReady}
              className="relative px-12 py-6 bg-[#d4af37] text-black rounded-full font-bold font-cairo uppercase tracking-[6px] shadow-2xl flex items-center gap-4 transition-all disabled:opacity-50 disabled:bg-slate-800 disabled:text-slate-500"
            >
              <Camera className="w-8 h-8" />
              <span>ابدأ التحليل</span>
            </motion.button>
          ) : (
            !isAnalyzing && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={reset}
                className="bg-white/10 backdrop-blur-md px-16 py-5 rounded-full border border-white/20 hover:bg-white/20 transition-all font-cairo uppercase tracking-[6px] text-sm text-white shadow-xl"
              >
                العودة للمرآة
              </motion.button>
            )
          )}
        </div>
        
        {/* Invisible Status For Voice System */}
        <div className="sr-only">
          {result && `${result.feedback} ${result.advice} ${result.suggestedOutfit}`}
        </div>
      </div>

      <style>{`
        @keyframes scan {
          0%, 100% { top: 10%; opacity: 0.1; }
          50% { top: 85%; opacity: 0.6; }
        }
      `}</style>
      
      {/* Canvas for photo capture (Hidden) */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}

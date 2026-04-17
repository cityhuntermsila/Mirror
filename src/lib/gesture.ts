import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

let handLandmarker: HandLandmarker | undefined;

export async function initHandDetection() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numHands: 2
  });
  return handLandmarker;
}

export function isHandClosed(landmarks: any[]) {
  // Use distance between tips and palm base (landmark 0)
  // Or simpler: compare tip Y with joint Y
  // Indexes for tips: 8, 12, 16, 20
  // Indexes for joints: 6, 10, 14, 18
  
  const tips = [8, 12, 16, 20];
  const joints = [6, 10, 14, 18];
  
  let extendedFingers = 0;
  for (let i = 0; i < tips.length; i++) {
    if (landmarks[tips[i]].y < landmarks[joints[i]].y) {
      extendedFingers++;
    }
  }
  
  // Also check thumb (landmark 4 vs 3 or 2)
  // Thumb is horizontal-ish usually, check X distance from palm 17
  if (Math.abs(landmarks[4].x - landmarks[17].x) > Math.abs(landmarks[3].x - landmarks[17].x)) {
    extendedFingers++;
  }

  return extendedFingers <= 1; // 0 or 1 finger extended is "closed" (fist)
}

export function isHandOpen(landmarks: any[]) {
  const tips = [8, 12, 16, 20];
  const joints = [6, 10, 14, 18];
  
  let extendedFingers = 0;
  for (let i = 0; i < tips.length; i++) {
    if (landmarks[tips[i]].y < landmarks[joints[i]].y) {
      extendedFingers++;
    }
  }
  
  return extendedFingers >= 4; // 4 or 5 fingers extended is "open"
}

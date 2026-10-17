
"use client";

import { useEffect, useRef, useState } from "react";
import Tesseract from "tesseract.js";
import type {
  AiParsedReceipt,
  AiReceiptItem,
  AiReceiptTotals,
} from "@/app/receipt-types";
import {
  calculateReceiptTotal,
  calculateReceiptSplits,
  formatCents,
  type TipSplitMode,
} from "@/app/split-calculations";
import type {
  ReceiptAssignment,
  SplitAssistantResult,
  SplitInstructionMessage,
} from "@/app/split-types";

type DetectedWord = {
  text: string;
  bbox: Tesseract.Bbox;
};

type CameraFacingMode = "user" | "environment";

function isAiParsedReceipt(value: unknown): value is AiParsedReceipt {
  if (
    typeof value !== "object" ||
    value === null ||
    !("items" in value) ||
    !Array.isArray(value.items) ||
    !("totals" in value) ||
    typeof value.totals !== "object" ||
    value.totals === null
  ) {
    return false;
  }

  const totals = value.totals;
  return (
    value.items.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "quantity" in item &&
        typeof item.quantity === "string" &&
        "description" in item &&
        typeof item.description === "string" &&
        "amount" in item &&
        typeof item.amount === "string"
    ) &&
    "subtotal" in totals &&
    typeof totals.subtotal === "string" &&
    "tax" in totals &&
    typeof totals.tax === "string" &&
    "tip" in totals &&
    typeof totals.tip === "string" &&
    "total" in totals &&
    typeof totals.total === "string"
  );
}

function isSplitAssistantResult(value: unknown): value is SplitAssistantResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "reply" in value &&
    typeof value.reply === "string" &&
    "clarification" in value &&
    typeof value.clarification === "string" &&
    "assignments" in value &&
    Array.isArray(value.assignments) &&
    value.assignments.every(
      (assignment: unknown) =>
        typeof assignment === "object" &&
        assignment !== null &&
        "itemIndex" in assignment &&
        typeof assignment.itemIndex === "number" &&
        Number.isInteger(assignment.itemIndex) &&
        "people" in assignment &&
        Array.isArray(assignment.people) &&
        assignment.people.every(
          (person: unknown) =>
            typeof person === "string" && person.trim().length > 0
        )
    )
  );
}

function enhanceOcrImage(
  context: CanvasRenderingContext2D,
  width: number,
  height: number
) {
  const pixels = context.getImageData(0, 0, width, height);

  for (let index = 0; index < pixels.data.length; index += 4) {
    const gray =
      pixels.data[index] * 0.299 +
      pixels.data[index + 1] * 0.587 +
      pixels.data[index + 2] * 0.114;
    const enhanced = Math.max(0, Math.min(255, (gray - 128) * 1.35 + 128));
    pixels.data[index] = enhanced;
    pixels.data[index + 1] = enhanced;
    pixels.data[index + 2] = enhanced;
  }

  context.putImageData(pixels, 0, 0);
}

export default function ReceiptScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] =
    useState<CameraFacingMode>("environment");
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState("");
  const [switchingCamera, setSwitchingCamera] = useState(false);
  const [frozenImage, setFrozenImage] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState("");
  const [status, setStatus] = useState("Start your camera to scan a receipt.");
  const [progress, setProgress] = useState(0);
  const [detectedWords, setDetectedWords] = useState<DetectedWord[]>([]);
  const [receiptRows, setReceiptRows] = useState<AiReceiptItem[]>([]);
  const [receiptTotals, setReceiptTotals] = useState<AiReceiptTotals>({
    subtotal: "",
    tax: "",
    tip: "",
    total: "",
  });
  const [receiptTotalEdited, setReceiptTotalEdited] = useState(false);
  const [aiParsing, setAiParsing] = useState(false);
  const [aiParsed, setAiParsed] = useState(false);
  const [aiError, setAiError] = useState("");
  const [splitAssistantOpen, setSplitAssistantOpen] = useState(false);
  const [splitMessages, setSplitMessages] = useState<SplitInstructionMessage[]>([]);
  const [splitMessage, setSplitMessage] = useState("");
  const [splitAssignments, setSplitAssignments] = useState<ReceiptAssignment[]>([]);
  const [splitParsing, setSplitParsing] = useState(false);
  const [splitError, setSplitError] = useState("");
  const [tipOptionsOpen, setTipOptionsOpen] = useState(false);
  const [tipSplitMode, setTipSplitMode] =
    useState<TipSplitMode>("proportional");
  const [manualTipAmounts, setManualTipAmounts] = useState<
    Record<string, string>
  >({});
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });

  const proportionalTipCalculation = calculateReceiptSplits(
    receiptRows,
    receiptTotals,
    splitAssignments
  );
  const splitCalculation = calculateReceiptSplits(
    receiptRows,
    receiptTotals,
    splitAssignments,
    { mode: tipSplitMode, manualAmounts: manualTipAmounts }
  );
  const displayedReceiptTotal = receiptTotalEdited
    ? calculateReceiptTotal(receiptTotals)
    : receiptTotals.total;

  function selectTipSplitMode(mode: TipSplitMode) {
    if (mode === "manual" && tipSplitMode !== "manual") {
      setManualTipAmounts((currentAmounts) => {
        const amounts = {
          ...currentAmounts,
          ...Object.fromEntries(
            proportionalTipCalculation.people.map((person) => [
              person.person.toLowerCase(),
              currentAmounts[person.person.toLowerCase()] ??
                (person.tipCents / 100).toFixed(2),
            ])
          ),
        };
        if (proportionalTipCalculation.unassignedCents > 0) {
          amounts.__unassigned__ =
            currentAmounts.__unassigned__ ??
            (proportionalTipCalculation.unassignedTipCents / 100).toFixed(2);
        } else {
          delete amounts.__unassigned__;
        }
        return amounts;
      });
    }
    setTipSplitMode(mode);
  }

  async function startCamera(
    facingMode: CameraFacingMode = cameraFacingMode,
    deviceId?: string
  ) {
    let stream: MediaStream | null = null;

    try {
      if (!window.isSecureContext) {
        setStatus("Camera access requires a secure HTTPS connection.");
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("This browser does not support camera access.");
        return;
      }

      setStatus("Opening camera...");

      stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId
          ? { deviceId: { exact: deviceId } }
          : { facingMode: { ideal: facingMode } },
        audio: false,
      });

      streamRef.current = stream;
      const activeTrack = stream.getVideoTracks()[0];
      const activeCameraId = activeTrack.getSettings().deviceId ?? "";
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((device) => device.kind === "videoinput");
      setVideoDevices(cameras);
      setActiveDeviceId(activeCameraId);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraOn(true);
      setFrozenImage(null);
      setDetectedWords([]);
      setReceiptRows([]);
      setReceiptTotals({ subtotal: "", tax: "", tip: "", total: "" });
      setReceiptTotalEdited(false);
      setAiParsed(false);
      setAiError("");
      setSplitAssistantOpen(false);
      setSplitMessages([]);
      setSplitAssignments([]);
      setSplitMessage("");
      setSplitError("");
      setFrameSize({ width: 0, height: 0 });
      setStatus(
        cameras.length < 2
          ? "Only one camera is available to this browser."
          : "Fit the receipt inside the guide and hold steady."
      );
    } catch (error) {
      console.error(error);
      stream?.getTracks().forEach((track) => track.stop());
      const errorName =
        error instanceof DOMException ? error.name : "UnknownError";
      const cameraErrorMessage =
        errorName === "NotAllowedError" || errorName === "SecurityError"
          ? "Camera access is blocked for this site. In Android Chrome, tap the icon by the address bar, open Permissions, set Camera to Allow, and reload. Also check Android Settings > Apps > Chrome > Permissions > Camera."
          : errorName === "NotFoundError"
            ? "No camera was found on this device."
            : errorName === "NotReadableError"
              ? "The camera is busy or unavailable. Close other apps using it and try again."
              : "Could not access the camera. Check browser permissions and try again.";
      setStatus(
        deviceId &&
          errorName !== "NotAllowedError" &&
          errorName !== "SecurityError"
          ? "Could not switch cameras. Try reopening the camera."
          : cameraErrorMessage
      );
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  async function flipCamera() {
    if (videoDevices.length < 2) {
      setStatus("This browser only has one camera available to switch to.");
      return;
    }

    const currentIndex = videoDevices.findIndex(
      (device) => device.deviceId === activeDeviceId
    );
    const nextFacingMode =
      cameraFacingMode === "environment" ? "user" : "environment";
    const targetLabel =
      nextFacingMode === "user" ? /front|user|selfie/i : /back|rear|environment/i;
    const nextDevice =
      videoDevices.find(
        (device) =>
          device.deviceId !== activeDeviceId && targetLabel.test(device.label)
      ) ??
      videoDevices[
        (currentIndex + 1 + videoDevices.length) % videoDevices.length
      ];

    setSwitchingCamera(true);
    stopCamera();
    setCameraFacingMode(nextFacingMode);
    try {
      await startCamera(nextFacingMode, nextDevice.deviceId);
    } finally {
      setSwitchingCamera(false);
    }
  }

  function freezeFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || !video.videoWidth) {
      setStatus("Wait for the camera to load, then try again.");
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    setFrameSize({ width: video.videoWidth, height: video.videoHeight });

    const context = canvas.getContext("2d");

    if (!context) {
      setStatus("Could not capture the image.");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageUrl = canvas.toDataURL("image/jpeg", 0.95);
    setFrozenImage(imageUrl);
    setExtractedText("");
    setReceiptRows([]);
    setReceiptTotals({ subtotal: "", tax: "", tip: "", total: "" });
    setReceiptTotalEdited(false);
    setStatus("Image frozen. Finding text and drawing its boxes...");
    stopCamera();
    void readImage(imageUrl);
  }

  useEffect(() => {
    if (!cameraOn) return;

    let cancelled = false;
    let worker: Tesseract.Worker | null = null;

    async function detectText() {
      try {
        setStatus("Loading live text detection...");
        worker = await Tesseract.createWorker("eng");
        await worker.setParameters({
          tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
          preserve_interword_spaces: "1",
        });
        const frameCanvas = document.createElement("canvas");
        const frameContext = frameCanvas.getContext("2d");

        if (!frameContext) {
          throw new Error("Could not create a canvas for live text detection.");
        }

        if (cancelled) return;

        setStatus(
          "Live detection is ready. Fit the receipt inside the guide and hold steady."
        );

        while (!cancelled) {
          const video = videoRef.current;

          if (!video || video.readyState < 2 || !video.videoWidth) {
            await new Promise((resolve) => setTimeout(resolve, 200));
            continue;
          }

          const sourceWidth = video.videoWidth;
          const sourceHeight = video.videoHeight;
          const cropX = Math.round(sourceWidth * 0.08);
          const cropY = Math.round(sourceHeight * 0.08);
          const cropWidth = Math.round(sourceWidth * 0.84);
          const cropHeight = Math.round(sourceHeight * 0.84);
          const scale = Math.min(
            2.5,
            3000 / Math.max(cropWidth, cropHeight)
          );

          frameCanvas.width = Math.round(cropWidth * scale);
          frameCanvas.height = Math.round(cropHeight * scale);
          frameContext.imageSmoothingEnabled = true;
          frameContext.imageSmoothingQuality = "high";
          frameContext.drawImage(
            video,
            cropX,
            cropY,
            cropWidth,
            cropHeight,
            0,
            0,
            frameCanvas.width,
            frameCanvas.height
          );

          enhanceOcrImage(frameContext, frameCanvas.width, frameCanvas.height);

          const result = await worker.recognize(
            frameCanvas,
            {},
            { text: true, blocks: true }
          );

          if (cancelled) return;

          setFrameSize({ width: sourceWidth, height: sourceHeight });
          setDetectedWords(
            (result.data.blocks ?? [])
              .flatMap((block) =>
                block.paragraphs.flatMap((paragraph) =>
                  paragraph.lines.flatMap((line) => line.words)
                )
              )
              .filter(
                (word) =>
                  word.text.trim().length > 0 &&
                  word.confidence >= 45 &&
                  word.bbox.x1 > word.bbox.x0 &&
                  word.bbox.y1 > word.bbox.y0
              )
              .map(({ text, bbox }) => ({
                text,
                bbox: {
                  x0: bbox.x0 / scale + cropX,
                  y0: bbox.y0 / scale + cropY,
                  x1: bbox.x1 / scale + cropX,
                  y1: bbox.y1 / scale + cropY,
                },
              }))
          );
        }
      } catch (error) {
        if (!cancelled) {
          console.error(error);
          setStatus("Live text detection failed. Try reopening the camera.");
        }
      } finally {
        if (worker) {
          try {
            await worker.terminate();
          } catch (error) {
            console.error(error);
            if (!cancelled) {
              setStatus("Could not stop live text detection cleanly.");
            }
          }
        }
      }
    }

    void detectText();

    return () => {
      cancelled = true;
    };
  }, [cameraOn]);

  async function readImage(imageUrl: string) {
    let worker: Tesseract.Worker | null = null;

    try {
      setStatus("Locating the receipt and reading its text...");
      setProgress(0);
      setExtractedText("");
      setAiError("");
      setReceiptRows([]);
      setReceiptTotals({ subtotal: "", tax: "", tip: "", total: "" });
      setReceiptTotalEdited(false);
      setAiParsed(false);
      setSplitAssistantOpen(false);
      setSplitMessages([]);
      setSplitAssignments([]);
      setSplitMessage("");
      setSplitError("");

      const image = new Image();
      image.src = imageUrl;
      await image.decode();

      let progressStage: "locating" | "reading" = "locating";
      worker = await Tesseract.createWorker("eng", undefined, {
        logger: (message) => {
          if (message.status === "recognizing text") {
            const stageProgress = Math.round(message.progress * 100);
            setProgress(
              progressStage === "locating"
                ? Math.round(stageProgress * 0.35)
                : 35 + Math.round(stageProgress * 0.65)
            );
          }
        },
      });
      await worker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM.AUTO,
        preserve_interword_spaces: "1",
        user_defined_dpi: "300",
      });

      const previewScale = Math.min(
        1,
        1600 / Math.max(image.naturalWidth, image.naturalHeight)
      );
      const previewCanvas = document.createElement("canvas");
      previewCanvas.width = Math.max(
        1,
        Math.round(image.naturalWidth * previewScale)
      );
      previewCanvas.height = Math.max(
        1,
        Math.round(image.naturalHeight * previewScale)
      );
      const previewContext = previewCanvas.getContext("2d");

      if (!previewContext) {
        throw new Error("Could not prepare the receipt preview for cropping.");
      }

      previewContext.drawImage(
        image,
        0,
        0,
        previewCanvas.width,
        previewCanvas.height
      );
      enhanceOcrImage(previewContext, previewCanvas.width, previewCanvas.height);

      const previewResult = await worker.recognize(
        previewCanvas,
        {},
        { text: false, blocks: true }
      );
      const previewWords = (previewResult.data.blocks ?? [])
        .flatMap((block) =>
          block.paragraphs.flatMap((paragraph) =>
            paragraph.lines.flatMap((line) => line.words)
          )
        )
        .filter(
          (word) =>
            word.confidence >= 45 &&
            word.bbox.x1 > word.bbox.x0 &&
            word.bbox.y1 > word.bbox.y0
        );

      let cropLeft = 0;
      let cropWidth = image.naturalWidth;
      if (previewWords.length > 0) {
        const padding = previewCanvas.width * 0.06;
        const left = Math.max(
          0,
          Math.min(...previewWords.map((word) => word.bbox.x0)) - padding
        );
        const right = Math.min(
          previewCanvas.width,
          Math.max(...previewWords.map((word) => word.bbox.x1)) + padding
        );
        const detectedWidth = right - left;

        if (
          detectedWidth >= previewCanvas.width * 0.35 &&
          detectedWidth <= previewCanvas.width * 0.9
        ) {
          cropLeft = left / previewScale;
          cropWidth = detectedWidth / previewScale;
        }
      }

      progressStage = "reading";
      setStatus(
        cropWidth < image.naturalWidth
          ? "Reading the receipt using a hidden crop..."
          : "Reading the full image..."
      );

      const scale = Math.min(
        2,
        4000 / Math.max(cropWidth, image.naturalHeight)
      );
      const ocrCanvas = document.createElement("canvas");
      ocrCanvas.width = Math.round(cropWidth * scale);
      ocrCanvas.height = Math.round(image.naturalHeight * scale);
      const ocrContext = ocrCanvas.getContext("2d");

      if (!ocrContext) {
        throw new Error("Could not prepare the receipt image for OCR.");
      }

      ocrContext.imageSmoothingEnabled = true;
      ocrContext.imageSmoothingQuality = "high";
      ocrContext.drawImage(
        image,
        cropLeft,
        0,
        cropWidth,
        image.naturalHeight,
        0,
        0,
        ocrCanvas.width,
        ocrCanvas.height
      );
      enhanceOcrImage(ocrContext, ocrCanvas.width, ocrCanvas.height);

      const result = await worker.recognize(
        ocrCanvas,
        {},
        { text: true, blocks: true }
      );

      setExtractedText(result.data.text);
      const words: DetectedWord[] = (result.data.blocks ?? [])
        .flatMap((block) =>
          block.paragraphs.flatMap((paragraph) =>
            paragraph.lines.flatMap((line) => line.words)
          )
        )
        .filter(
          (word) =>
            word.text.trim().length > 0 &&
            word.confidence >= 35 &&
            word.bbox.x1 > word.bbox.x0 &&
            word.bbox.y1 > word.bbox.y0
        )
        .map(({ text, bbox }) => ({
          text,
          bbox: {
            x0: bbox.x0 / scale + cropLeft,
            y0: bbox.y0 / scale,
            x1: bbox.x1 / scale + cropLeft,
            y1: bbox.y1 / scale,
          },
        }));
      setDetectedWords(words);
      setStatus(
        words.length > 0
          ? `Found ${words.length} words. Review the text, then parse it with AI if you want structured items and totals.`
          : "No text was detected. Move closer, improve the lighting, and hold steady."
      );
    } catch (error) {
      console.error(error);
      setStatus("OCR failed. Try taking a clearer picture.");
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch (error) {
          console.error(error);
          setStatus("Could not stop receipt text detection cleanly.");
        }
      }
    }
  }

  async function extractText() {
    if (!frozenImage) return;
    await readImage(frozenImage);
  }

  async function parseWithAi() {
    if (!extractedText.trim() || !frozenImage || aiParsing) return;

    setAiParsing(true);
    setAiError("");
    try {
      const response = await fetch("/api/parse-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiptText: extractedText,
          imageDataUrl: frozenImage,
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof result === "object" &&
          result !== null &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "AI parsing failed. Please try again.";
        throw new Error(message);
      }

      if (!isAiParsedReceipt(result)) {
        throw new Error("AI returned an unexpected result. Please try again.");
      }

      setReceiptRows(result.items);
      setReceiptTotals(result.totals);
      setReceiptTotalEdited(false);
      setAiParsed(true);
      setSplitMessages([]);
      setSplitAssignments([]);
      setSplitMessage("");
      setSplitError("");
      setTipOptionsOpen(false);
      setTipSplitMode("proportional");
      setManualTipAmounts({});
      setStatus("AI parsed the receipt. Review and edit the results as needed.");
    } catch (error) {
      console.error(error);
      setAiError(
        error instanceof Error
          ? error.message
          : "AI parsing failed. Please try again."
      );
    } finally {
      setAiParsing(false);
    }
  }

  async function sendSplitMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = splitMessage.trim();
    if (!content || splitParsing || !aiParsed) return;

    setSplitParsing(true);
    setSplitError("");
    const messages = [
      ...splitMessages.slice(-(20 - 1)),
      { role: "user" as const, content },
    ];
    try {
      const response = await fetch("/api/split-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: receiptRows,
          totals: receiptTotals,
          assignments: splitAssignments,
          messages,
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof result === "object" &&
          result !== null &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "The split assistant could not process that message.";
        throw new Error(message);
      }
      if (!isSplitAssistantResult(result)) {
        throw new Error("The split assistant returned an unexpected result.");
      }

      const assistantReply = result.clarification
        ? `${result.reply} ${result.clarification}`
        : result.reply;
      setSplitAssignments(result.assignments);
      setSplitMessages([
        ...messages,
        { role: "assistant", content: assistantReply },
      ]);
      setSplitMessage("");
    } catch (error) {
      console.error(error);
      setSplitError(
        error instanceof Error
          ? error.message
          : "The split assistant could not process that message."
      );
    } finally {
      setSplitParsing(false);
    }
  }

  function retake() {
    setFrozenImage(null);
    setExtractedText("");
    setReceiptRows([]);
    setReceiptTotals({ subtotal: "", tax: "", tip: "", total: "" });
    setReceiptTotalEdited(false);
    setAiParsed(false);
    setAiError("");
    setSplitAssistantOpen(false);
    setSplitMessages([]);
    setSplitAssignments([]);
    setSplitMessage("");
    setSplitError("");
    setProgress(0);
    void startCamera();
  }

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <main className="mx-auto min-h-svh w-full max-w-2xl space-y-5 overflow-x-hidden px-4 py-5 font-sans sm:px-6 sm:py-6">
      <h1 className="text-2xl font-bold sm:text-3xl">
        Splits Receipt Scanner
      </h1>
      <p className="text-sm text-gray-600 sm:text-base">
        Fit the receipt inside the on-screen guide, keep it flat and well lit,
        then freeze the image to extract its text.
      </p>

      <div className="relative w-full min-w-0 overflow-hidden rounded-xl bg-black">
        {frozenImage ? (
          <img
            src={frozenImage}
            alt="Frozen receipt"
            className="block max-h-[65dvh] min-h-48 w-full object-contain sm:max-h-[70vh] sm:min-h-64"
          />
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="block max-h-[65dvh] min-h-48 w-full object-contain sm:max-h-[70vh] sm:min-h-64"
          />
        )}
        {detectedWords.length > 0 && frameSize.width > 0 && (
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox={`0 0 ${frameSize.width} ${frameSize.height}`}
            preserveAspectRatio="xMidYMid meet"
          >
            {detectedWords.map(({ text, bbox }, index) => (
              <g key={`${bbox.x0}-${bbox.y0}-${index}`}>
                <rect
                  x={bbox.x0}
                  y={bbox.y0}
                  width={bbox.x1 - bbox.x0}
                  height={bbox.y1 - bbox.y0}
                  fill="rgba(34, 197, 94, 0.12)"
                  stroke="#22c55e"
                  strokeWidth={Math.max(2, frameSize.width / 500)}
                />
                <text
                  x={bbox.x0 + 2}
                  y={Math.max(bbox.y0 - 4, 12)}
                  fill="#86efac"
                  fontSize={Math.max(
                    8,
                    Math.min(24, (bbox.y1 - bbox.y0) * 0.55)
                  )}
                  fontWeight="600"
                  paintOrder="stroke"
                  stroke="#14532d"
                  strokeWidth={1.5}
                >
                  {text}
                </text>
              </g>
            ))}
          </svg>
        )}
        {!frozenImage && frameSize.width > 0 && frameSize.height > 0 && (
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox={`0 0 ${frameSize.width} ${frameSize.height}`}
            preserveAspectRatio="xMidYMid meet"
          >
            <rect
              x={frameSize.width * 0.08}
              y={frameSize.height * 0.08}
              width={frameSize.width * 0.84}
              height={frameSize.height * 0.84}
              fill="none"
              stroke="white"
              strokeDasharray={`${frameSize.width * 0.012} ${frameSize.width * 0.008}`}
              strokeWidth={Math.max(2, frameSize.width / 400)}
            />
          </svg>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      <p role="status" className="break-words text-sm text-gray-600">
        {status}
      </p>

      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
        {!cameraOn && !frozenImage && (
          <button
            onClick={() => void startCamera()}
            className="col-span-2 min-h-12 min-w-0 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white sm:col-span-1 sm:text-base"
          >
            Open camera
          </button>
        )}

        {cameraOn && (
          <>
            <button
              onClick={freezeFrame}
              className="col-span-2 min-h-12 min-w-0 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white sm:col-span-1 sm:text-base"
            >
              Freeze frame
            </button>
            <button
              onClick={() => void flipCamera()}
              disabled={switchingCamera}
              className="min-h-12 min-w-0 rounded-lg border px-3 py-3 text-sm disabled:opacity-50 sm:px-4 sm:text-base"
              aria-label="Switch camera"
            >
              {switchingCamera
                ? "Switching camera..."
                : `Switch camera${videoDevices.length > 1 ? ` (${videoDevices.length} available)` : ""}`}
            </button>
            <button
              onClick={stopCamera}
              className="min-h-12 min-w-0 rounded-lg border px-3 py-3 text-sm sm:px-4 sm:text-base"
            >
              Stop camera
            </button>
          </>
        )}

        {frozenImage && (
          <>
            <button
              onClick={extractText}
              className="min-h-12 min-w-0 rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold text-white sm:text-base"
            >
              Extract text
            </button>
            <button
              onClick={retake}
              className="min-h-12 min-w-0 rounded-lg border px-4 py-3 text-sm sm:text-base"
            >
              Retake
            </button>
          </>
        )}
      </div>

      {progress > 0 && progress < 100 && (
        <div>
          <div className="mb-1 text-sm">OCR progress: {progress}%</div>
          <progress value={progress} max={100} className="w-full" />
        </div>
      )}

      {extractedText && (
        <section className="min-w-0 space-y-3 rounded-xl border p-3 sm:p-4">
          <h2 className="text-xl font-semibold">Receipt text</h2>
          <p className="text-sm text-gray-600">
            OCR extracts the printed text. Select <strong>Parse with AI</strong>
            to send the photo and extracted text to Gemini for organizing into
            items and totals. Review the results against the original receipt.
          </p>
          {aiParsed && (
            <>
              <div className="max-w-full overflow-x-auto">
                <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b">
                      <th scope="col" className="w-20 px-2 py-2 font-semibold">
                        Qty
                      </th>
                      <th scope="col" className="px-2 py-2 font-semibold">
                        Description
                      </th>
                      <th
                        scope="col"
                        className="w-36 px-2 py-2 text-right font-semibold"
                      >
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiptRows.map((row, index) => (
                      <tr key={index} className="border-b last:border-0">
                        <td className="px-2 py-1">
                          <input
                            value={row.quantity}
                            onChange={(event) =>
                              setReceiptRows((currentRows) =>
                                currentRows.map((currentRow, rowIndex) =>
                                  rowIndex === index
                                    ? { ...currentRow, quantity: event.target.value }
                                    : currentRow
                                )
                              )
                            }
                            className="w-full min-w-0 rounded border px-2 py-2 text-base"
                            aria-label={`Quantity for row ${index + 1}`}
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            value={row.description}
                            onChange={(event) =>
                              setReceiptRows((currentRows) =>
                                currentRows.map((currentRow, rowIndex) =>
                                  rowIndex === index
                                    ? { ...currentRow, description: event.target.value }
                                    : currentRow
                                )
                              )
                            }
                            className="w-full min-w-0 rounded border px-2 py-2 text-base"
                            aria-label={`Description for row ${index + 1}`}
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            value={row.amount}
                            onChange={(event) =>
                              setReceiptRows((currentRows) =>
                                currentRows.map((currentRow, rowIndex) =>
                                  rowIndex === index
                                    ? { ...currentRow, amount: event.target.value }
                                    : currentRow
                                )
                              )
                            }
                            className="w-full min-w-0 rounded border px-2 py-2 text-right text-base"
                            aria-label={`Amount for row ${index + 1}`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold">Receipt totals</h3>
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      ["subtotal", "Subtotal"],
                      ["tax", "Tax"],
                      ["tip", "Tip / gratuity"],
                      ["total", "Total"],
                    ] as const
                  ).map(([field, label]) => (
                    <label key={field} className="space-y-1 text-sm">
                      <span className="block">{label}</span>
                      <input
                        value={
                          field === "total"
                            ? displayedReceiptTotal
                            : receiptTotals[field]
                        }
                        readOnly={field === "total"}
                        onChange={
                          field === "total"
                            ? undefined
                            : (event) => {
                                setReceiptTotalEdited(true);
                                setReceiptTotals((currentTotals) => ({
                                  ...currentTotals,
                                  [field]: event.target.value,
                                }));
                              }
                        }
                        className={`w-full min-w-0 rounded border px-2 py-2 text-base ${
                          field === "total" ? "bg-gray-100" : ""
                        }`}
                        aria-label={label}
                      />
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-600">
                  Total updates from subtotal, tax, and tip when you edit them.
                </p>
              </div>
            </>
          )}
          {aiParsed && receiptRows.length > 0 && (
            <div className="space-y-3 border-t pt-3">
              <button
                type="button"
                aria-expanded={splitAssistantOpen}
                onClick={() => setSplitAssistantOpen((open) => !open)}
                className="min-h-12 w-full rounded-lg border px-4 py-3 text-left font-semibold sm:w-auto"
              >
                {splitAssistantOpen ? "Hide split chat" : "Split items with chat"}
              </button>
              {splitAssistantOpen && (
                <div className="space-y-4 rounded-lg bg-gray-50 p-3 sm:p-4">
                  <div>
                    <h3 className="font-semibold">Split items with chat</h3>
                    <p className="mt-1 text-sm text-gray-600">
                      Tell the assistant who had each item. For example:
                      “Sandy gets the burger, John gets the fries, and Bob and
                      Joe split the pizza.” Shared items are divided equally.
                      Tax and tip are allocated in proportion to each person’s
                      share of the item subtotal.
                    </p>
                  </div>

                  <div
                    aria-live="polite"
                    className="max-h-64 space-y-3 overflow-y-auto rounded-lg border bg-white p-3"
                  >
                    {splitMessages.length === 0 && (
                      <p className="text-sm text-gray-600">
                        Start by naming the person or people for an item. If an
                        item is unclear, the assistant will ask you to clarify.
                      </p>
                    )}
                    {splitMessages.map((message, index) => (
                      <div
                        key={`${index}-${message.role}`}
                        className={`max-w-[90%] break-words rounded-lg px-3 py-2 text-sm ${
                          message.role === "user"
                            ? "ml-auto bg-blue-100 text-blue-950"
                            : "bg-gray-100 text-gray-900"
                        }`}
                      >
                        <div className="mb-1 text-xs font-semibold">
                          {message.role === "user" ? "You" : "Split assistant"}
                        </div>
                        {message.content}
                      </div>
                    ))}
                    {splitParsing && (
                      <p className="text-sm text-gray-500" role="status">
                        Checking the receipt items...
                      </p>
                    )}
                  </div>

                  <form onSubmit={sendSplitMessage} className="space-y-2">
                    <label htmlFor="split-instruction" className="sr-only">
                      Describe how to split the receipt items
                    </label>
                    <textarea
                      id="split-instruction"
                      value={splitMessage}
                      onChange={(event) => setSplitMessage(event.target.value)}
                      placeholder="e.g. Sandy gets the burger; Bob and Joe split the pizza"
                      rows={3}
                      maxLength={1000}
                      className="w-full min-w-0 rounded-lg border p-3 text-base"
                    />
                    <button
                      type="submit"
                      disabled={!splitMessage.trim() || splitParsing}
                      className="min-h-12 w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                    >
                      {splitParsing ? "Splitting..." : "Send"}
                    </button>
                  </form>

                  {splitError && (
                    <p role="alert" className="text-sm text-red-700">
                      {splitError}
                    </p>
                  )}

                  {splitAssignments.length > 0 && (
                    <div className="space-y-3 border-t pt-3">
                      <h4 className="font-semibold">Current split</h4>
                      <ul className="space-y-2 text-sm">
                        {splitCalculation.lines
                          .map((line) => (
                            <li
                              key={line.itemIndex}
                              className="flex flex-col gap-1 border-b pb-2 sm:flex-row sm:justify-between"
                            >
                              <span className="break-words">
                                {line.description}
                              </span>
                              <span className="sm:text-right">
                                {line.amountCents === null
                                  ? "Amount needs review"
                                  : line.shares.length > 0
                                    ? line.shares
                                        .map(
                                          (share) =>
                                            `${share.person}: ${formatCents(share.amountCents)}`
                                        )
                                        .join(" · ")
                                    : "Unassigned"}
                              </span>
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}

                  <div className="space-y-3 border-t pt-3">
                        <button
                          type="button"
                          aria-expanded={tipOptionsOpen}
                          onClick={() => setTipOptionsOpen((open) => !open)}
                          className="min-h-11 rounded-lg border px-3 py-2 text-left font-semibold"
                        >
                          {tipOptionsOpen ? "Hide tip options" : "Tip options"}
                          {` · ${
                            tipSplitMode === "proportional"
                              ? "Split proportionally"
                              : tipSplitMode === "manual"
                                ? "Custom per person"
                                : "Not included"
                          }`}
                        </button>
                        {tipOptionsOpen && (
                          <div className="space-y-3 rounded-lg border bg-white p-3">
                            <p className="text-sm text-gray-600">
                              Tax remains proportional. Choose how the tip is
                              handled.
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {(
                                [
                                  ["proportional", "Split proportionally"],
                                  ["manual", "Set each person’s tip"],
                                  ["disabled", "Don’t split tip"],
                                ] as const
                              ).map(([mode, label]) => (
                                <button
                                  key={mode}
                                  type="button"
                                  aria-pressed={tipSplitMode === mode}
                                  onClick={() => selectTipSplitMode(mode)}
                                  className={`min-h-10 rounded-lg border px-3 py-2 text-sm font-medium ${
                                    tipSplitMode === mode
                                      ? "border-blue-700 bg-blue-50 text-blue-900"
                                      : "bg-white"
                                  }`}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                            {tipSplitMode === "manual" && (
                              <div className="space-y-2">
                                <p className="text-sm text-gray-600">
                                  Enter each person’s tip amount. These amounts
                                  replace the receipt tip allocation.
                                </p>
                                <div className="grid gap-2 sm:grid-cols-2">
                                  {splitCalculation.people.length === 0 && (
                                    <p className="text-sm text-gray-600 sm:col-span-2">
                                      Assign receipt items in the chat to set
                                      each person’s tip.
                                    </p>
                                  )}
                                  {splitCalculation.people.map((person) => {
                                    const key = person.person.toLowerCase();
                                    return (
                                      <label
                                        key={key}
                                        className="flex items-center justify-between gap-3 text-sm"
                                      >
                                        <span>{person.person}</span>
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          value={
                                            manualTipAmounts[key] ??
                                            ((
                                              proportionalTipCalculation.people.find(
                                                (entry) =>
                                                  entry.person.toLowerCase() ===
                                                  key
                                              )?.tipCents ?? 0
                                            ) / 100).toFixed(2)
                                          }
                                          onChange={(event) =>
                                            setManualTipAmounts((amounts) => ({
                                              ...amounts,
                                              [key]: event.target.value,
                                            }))
                                          }
                                          className="w-28 rounded border px-2 py-2 text-right text-base"
                                          aria-label={`${person.person} tip amount`}
                                        />
                                      </label>
                                    );
                                  })}
                                  {splitCalculation.unassignedCents > 0 && (
                                    <label className="flex items-center justify-between gap-3 text-sm">
                                      <span>Unassigned items</span>
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        value={
                                          manualTipAmounts.__unassigned__ ??
                                          (
                                            proportionalTipCalculation.unassignedTipCents /
                                            100
                                          ).toFixed(2)
                                        }
                                        onChange={(event) =>
                                          setManualTipAmounts((amounts) => ({
                                            ...amounts,
                                            __unassigned__: event.target.value,
                                          }))
                                        }
                                        className="w-28 rounded border px-2 py-2 text-right text-base"
                                        aria-label="Unassigned items tip amount"
                                      />
                                    </label>
                                  )}
                                </div>
                              </div>
                            )}
                            {tipSplitMode === "disabled" && (
                              <p className="text-sm text-gray-600">
                                The receipt tip will not be included in anyone’s
                                total.
                              </p>
                            )}
                          </div>
                        )}
                  </div>

                  {splitAssignments.length > 0 && (
                    <div className="space-y-3 border-t pt-3">
                      <h4 className="font-semibold">Each person owes</h4>
                      <ul className="space-y-2 text-sm">
                        {splitCalculation.people.map((person) => (
                          <li
                            key={person.person}
                            className="flex flex-col gap-1 border-b pb-2 sm:flex-row sm:justify-between"
                          >
                            <span>{person.person}</span>
                            <span className="sm:text-right">
                              Items {formatCents(person.itemsCents)}
                              {person.taxCents > 0 &&
                                ` · Tax ${formatCents(person.taxCents)}`}
                              {person.tipCents > 0 &&
                                ` · Tip ${formatCents(person.tipCents)}`}
                              {` · Total ${formatCents(person.itemsCents + person.taxCents + person.tipCents)}`}
                            </span>
                          </li>
                        ))}
                        {(splitCalculation.unassignedCents > 0 ||
                          splitCalculation.unassignedTaxCents > 0 ||
                          splitCalculation.unassignedTipCents > 0) && (
                          <li className="flex flex-col gap-1 text-gray-600 sm:flex-row sm:justify-between">
                            <span>Unassigned</span>
                            <span className="sm:text-right">
                              Items {formatCents(splitCalculation.unassignedCents)}
                              {splitCalculation.unassignedTaxCents > 0 &&
                                ` · Tax ${formatCents(splitCalculation.unassignedTaxCents)}`}
                              {splitCalculation.unassignedTipCents > 0 &&
                                ` · Tip ${formatCents(splitCalculation.unassignedTipCents)}`}
                            </span>
                          </li>
                        )}
                      </ul>
                      {!splitCalculation.canAllocateTaxAndTip && (
                        <p className="text-sm text-amber-800">
                          Some item amounts could not be read as numbers, so
                          tax and tip cannot be allocated reliably. Review the
                          item amounts above.
                        </p>
                      )}
                      {splitCalculation.manualTipNeedsReview && (
                        <p className="text-sm text-amber-800" role="alert">
                          Enter a valid non-negative amount for each tip share.
                          Invalid amounts are not included in the totals.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={parseWithAi}
              disabled={aiParsing}
              className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white disabled:cursor-wait disabled:opacity-60"
            >
              {aiParsing ? "Parsing photo with AI..." : "Parse photo with AI"}
            </button>
            <button
              onClick={() => navigator.clipboard.writeText(extractedText)}
              className="rounded-lg border px-4 py-2"
            >
              Copy text
            </button>
          </div>
          {aiError && (
            <p role="alert" className="text-sm text-red-700">
              {aiError}
            </p>
          )}
          <textarea
            value={extractedText}
            onChange={(event) => {
              setExtractedText(event.target.value);
              setAiParsed(false);
            }}
            rows={12}
            className="w-full min-w-0 rounded-lg border p-3 font-mono text-base sm:text-sm"
            aria-label="Edit extracted receipt text"
          />
        </section>
      )}
    </main>
  );
}

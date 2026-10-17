
"use client";

import { useEffect, useRef, useState } from "react";
import Tesseract from "tesseract.js";
import type {
  AiParsedReceipt,
  AiReceiptItem,
  AiReceiptTotals,
} from "../app/receipt-types";

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
  const [aiParsing, setAiParsing] = useState(false);
  const [aiParsed, setAiParsed] = useState(false);
  const [aiError, setAiError] = useState("");
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });

  async function startCamera(
    facingMode: CameraFacingMode = cameraFacingMode,
    deviceId?: string
  ) {
    let stream: MediaStream | null = null;

    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setStatus(
          "Camera access requires HTTPS and a browser that supports camera capture."
        );
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
      setAiParsed(false);
      setAiError("");
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
          ? "Camera permission is blocked. In Android Chrome, open this site's settings, allow Camera, then reload the page."
          : errorName === "NotFoundError"
            ? "No camera was found on this device."
            : errorName === "NotReadableError"
              ? "The camera is busy or unavailable. Close other apps using it and try again."
              : "Could not access the camera. Check browser permissions and try again.";
      setStatus(
        deviceId && errorName !== "NotAllowedError"
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
      setAiParsed(false);

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
      setAiParsed(true);
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

  function retake() {
    setFrozenImage(null);
    setExtractedText("");
    setReceiptRows([]);
    setReceiptTotals({ subtotal: "", tax: "", tip: "", total: "" });
    setAiParsed(false);
    setAiError("");
    setProgress(0);
    void startCamera();
  }

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <main className="mx-auto max-w-2xl space-y-5 p-6">
      <h1 className="text-3xl font-bold">Splits Receipt Scanner</h1>
      <p className="text-gray-600">
        Fit the receipt inside the on-screen guide, keep it flat and well lit,
        then freeze the image to extract its text.
      </p>

      <div className="relative overflow-hidden rounded-xl bg-black">
        {frozenImage ? (
          <img
            src={frozenImage}
            alt="Frozen receipt"
            className="max-h-[65vh] w-full object-contain"
          />
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="max-h-[65vh] min-h-64 w-full object-contain"
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

      <p role="status" className="text-sm text-gray-600">
        {status}
      </p>

      <div className="flex flex-wrap gap-3">
        {!cameraOn && !frozenImage && (
          <button
            onClick={() => void startCamera()}
            className="rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white"
          >
            Open camera
          </button>
        )}

        {cameraOn && (
          <>
            <button
              onClick={freezeFrame}
              className="rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white"
            >
              Freeze frame
            </button>
            <button
              onClick={() => void flipCamera()}
              disabled={switchingCamera}
              className="rounded-lg border px-4 py-3 disabled:opacity-50"
              aria-label="Switch camera"
            >
              {switchingCamera
                ? "Switching camera..."
                : `Switch camera${videoDevices.length > 1 ? ` (${videoDevices.length} available)` : ""}`}
            </button>
            <button
              onClick={stopCamera}
              className="rounded-lg border px-4 py-3"
            >
              Stop camera
            </button>
          </>
        )}

        {frozenImage && (
          <>
            <button
              onClick={extractText}
              className="rounded-lg bg-green-600 px-4 py-3 font-semibold text-white"
            >
              Extract text
            </button>
            <button
              onClick={retake}
              className="rounded-lg border px-4 py-3"
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
        <section className="space-y-3 rounded-xl border p-4">
          <h2 className="text-xl font-semibold">Receipt text</h2>
          <p className="text-sm text-gray-600">
            OCR extracts the printed text. Select <strong>Parse with AI</strong>
            to send the photo and extracted text to Gemini for organizing into
            items and totals. Review the results against the original receipt.
          </p>
          {aiParsed && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
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
                            className="w-full rounded border px-2 py-1"
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
                            className="w-full rounded border px-2 py-1"
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
                            className="w-full rounded border px-2 py-1 text-right"
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
                        value={receiptTotals[field]}
                        onChange={(event) =>
                          setReceiptTotals((currentTotals) => ({
                            ...currentTotals,
                            [field]: event.target.value,
                          }))
                        }
                        className="w-full rounded border px-2 py-1"
                        aria-label={label}
                      />
                    </label>
                  ))}
                </div>
              </div>
            </>
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
            className="w-full rounded-lg border p-3 font-mono text-sm"
            aria-label="Edit extracted receipt text"
          />
        </section>
      )}
    </main>
  );
}


"use client";

import Link from "next/link";
import { Suspense, useActionState, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { importReceipt } from "../dashboard/actions";
import Tesseract from "tesseract.js";
import "./detect.css";
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
import type { ReceiptAssignment } from "@/app/split-types";

type DetectedWord = {
  text: string;
  bbox: Tesseract.Bbox;
};

type CameraFacingMode = "user" | "environment";
type ReceiptProcessingStage =
  | "idle"
  | "extracting"
  | "parsing"
  | "complete"
  | "error";

const MAX_PDF_BYTES = 4 * 1024 * 1024;

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

/* ===== helpers and icons ===== */
const Svg = ({ children }: { children: ReactNode }) => (
  <svg className="i" viewBox="0 0 24 24" aria-hidden="true">{children}</svg>
);
const CheckIcon = () => <Svg><path d="M5 12l5 5 9-10" /></Svg>;
const CloseIcon = () => <Svg><path d="M6 6l12 12M18 6L6 18" /></Svg>;
const PlusIcon = () => <Svg><path d="M12 5v14M5 12h14" /></Svg>;
const BackIcon = () => <Svg><path d="M15 6l-6 6 6 6" /></Svg>;
const ChevIcon = () => <svg className="i chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>;
const CameraIcon = () => <Svg><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></Svg>;
const UploadIcon = () => <Svg><path d="M12 15V4M7 9l5-5 5 5" /><path d="M5 15v4h14v-4" /></Svg>;
const SwitchIcon = () => <Svg><path d="M4 10a8 8 0 0 1 14-4l2 2M20 14a8 8 0 0 1-14 4l-2-2" /><path d="M20 4v4h-4M4 20v-4h4" /></Svg>;
const RetakeIcon = () => <Svg><path d="M4 12a8 8 0 1 0 3-6.2" /><path d="M4 4v5h5" /></Svg>;
const CopyIcon = () => <Svg><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a1 1 0 0 1 1-1h10" /></Svg>;
const SparkIcon = () => <Svg><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></Svg>;
const PeopleIcon = () => <Svg><circle cx="9" cy="9" r="3" /><path d="M3.5 19c.6-2.8 2.8-4.5 5.5-4.5s4.9 1.7 5.5 4.5" /><circle cx="17" cy="8" r="2.5" /><path d="M16 13.6c2.4 0 4.1 1.6 4.6 4" /></Svg>;
const FlatIcon = () => <Svg><path d="M7 3h10v18l-2.5-1.5L12 21l-2.5-1.5L7 21z" /></Svg>;
const BulbIcon = () => <Svg><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" /></Svg>;
const FrameIcon = () => <Svg><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" /></Svg>;
const LogoMark = () => (
  <svg width="32" height="32" viewBox="3 3 60 60" aria-hidden="true">
    <g strokeWidth="6" strokeLinejoin="round">
      <polygon points="10,10 48,10 10,48" fill="#0FB67F" stroke="#0FB67F" />
      <polygon points="56,16 56,56 16,56" fill="#6C4DFF" stroke="#6C4DFF" />
    </g>
  </svg>
);

type ProcState = "waiting" | "running" | "done" | "error";
function ProcRow({ n, state, title, detail }: { n: number; state: ProcState; title: string; detail: string }) {
  const tag = { waiting: "Waiting", running: "In progress", done: "Done", error: "Didn’t work" }[state];
  return (
    <li>
      <span className={`pst ${state === "done" ? "done" : state === "running" ? "run" : state === "error" ? "err" : ""}`}>
        {state === "done" ? <CheckIcon /> : state === "running" ? <span className="spin" role="img" aria-label="In progress" /> : state === "error" ? "!" : n}
      </span>
      <div><b>{title}</b><small>{detail}</small></div>
      <span className={`ptag ${state === "done" ? "ok" : state === "running" ? "run" : state === "error" ? "err" : ""}`}>{tag}</span>
    </li>
  );
}

function Steps({ current }: { current: 1 | 2 | 3 }) {
  const labels = ["Take a photo", "Read the receipt", "Check the items"];
  return (
    <ol className="steps" aria-label="Steps">
      {labels.map((label, i) => {
        const n = i + 1;
        const cls = n === current ? "cur" : n < current ? "done" : "";
        return (
          <li key={label} className={`step ${cls}`} aria-current={n === current ? "step" : undefined}>
            <span className="n">{n < current ? <CheckIcon /> : n}</span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

function Sidebar() {
  const friends = [{ name: "Brayden", ini: "B", cls: "p1", inGroup: true }, { name: "Maya", ini: "M", cls: "p2", inGroup: true }, { name: "Jay", ini: "J", cls: "p1", inGroup: true }, { name: "Riley", ini: "R", cls: "p3", inGroup: false }];
  return (
    <aside className="side">
      <div className="brand"><LogoMark /><span>Splits</span></div>
      <section aria-labelledby="g-h">
        <h2 className="sh" id="g-h">Your groups</h2>
        <ul>{["Apartment 4B", "Lisbon trip"].map((g) => <li key={g}><button className="gbtn" type="button"><span>{g}</span><span className="cnt" /></button></li>)}</ul>
        <label className="lbl" htmlFor="ng">New group</label>
        <div className="inrow"><input id="ng" className="field" type="text" placeholder="Group name" /><button className="btn" type="button">Create</button></div>
      </section>
      <section aria-labelledby="f-h">
        <h2 className="sh" id="f-h">People</h2>
        <ul>
          {friends.map((f) => (
            <li key={f.name} className="fr">
              <span className={`av ${f.cls}`} aria-hidden="true">{f.ini}</span>
              <div><b>{f.name}</b><small>{f.inGroup ? "In Apartment 4B" : "Not in this group"}</small></div>
              <button className="mini" type="button" disabled={f.inGroup}>{f.inGroup ? "Added" : "Add"}</button>
              <button className="xb" type="button" aria-label={`Remove ${f.name}`}><CloseIcon /></button>
            </li>
          ))}
        </ul>
        <p className="lbl">Add someone to Apartment 4B</p>
        <div className="seg" role="group" aria-label="Add by"><button className="sg on" type="button" aria-pressed="true">Phone</button><button className="sg" type="button" aria-pressed="false">Email</button></div>
        <label className="lbl" htmlFor="ct">Phone number</label>
        <input id="ct" className="field" type="tel" placeholder="(555) 123-4567" />
        <button className="btn full" type="button"><PlusIcon />Add to group</button>
      </section>
      <div className="me"><span className="av lgav p0">GZ</span><div><b>Gordon Zeng</b><small>gordon@example.com</small></div><button className="btn txt" type="button">Sign out</button></div>
    </aside>
  );
}

function SaveReceiptButton({ rows }: { rows: AiReceiptItem[] }) {
  const params = useSearchParams();
  const listId = params.get("list");
  const groupId = params.get("group");
  const [state, action, pending] = useActionState(importReceipt, undefined);
  if (!listId || !groupId || rows.length === 0) return null;

  return (
    <form action={action} className="acts2">
      <input type="hidden" name="listId" value={listId} />
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="items" value={JSON.stringify(rows)} />
      <button type="submit" disabled={pending} className="btn lg">
        {pending ? "Adding to the list…" : "Add these items to the list"}
      </button>
      {state?.error ? <p className="msg err" role="alert">{state.error}</p> : null}
    </form>
  );
}

export default function ReceiptScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const receiptFileInputRef = useRef<HTMLInputElement>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] =
    useState<CameraFacingMode>("environment");
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState("");
  const [switchingCamera, setSwitchingCamera] = useState(false);
  const [frozenImage, setFrozenImage] = useState<string | null>(null);
  const [receiptDocumentDataUrl, setReceiptDocumentDataUrl] = useState<
    string | null
  >(null);
  const [receiptPdfFile, setReceiptPdfFile] = useState<File | null>(null);
  const [receiptDocumentName, setReceiptDocumentName] = useState("");
  const [extractedText, setExtractedText] = useState("");
  const [status, setStatus] = useState("Start your camera to scan a receipt.");
  const [progress, setProgress] = useState(0);
  const [processingStage, setProcessingStage] =
    useState<ReceiptProcessingStage>("idle");
  const [ocrCompleted, setOcrCompleted] = useState(false);
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
  const [itemAssignmentsOpen, setItemAssignmentsOpen] = useState(false);
  const [userNames, setUserNames] = useState<string[]>([]);
  const [userNameInput, setUserNameInput] = useState("");
  const [splitAssignments, setSplitAssignments] = useState<ReceiptAssignment[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [tipOptionsOpen, setTipOptionsOpen] = useState(false);
  const [tipSplitMode, setTipSplitMode] =
    useState<TipSplitMode>("proportional");
  const [manualTipAmounts, setManualTipAmounts] = useState<
    Record<string, string>
  >({});
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const isPdfReceipt = receiptDocumentDataUrl?.startsWith(
    "data:application/pdf;base64,"
  ) ?? false;

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
  const extractionStatus = isPdfReceipt
    ? "Skipped for PDF"
    : processingStage === "extracting"
      ? `In progress${progress > 0 ? ` · ${progress}%` : ""}`
      : extractedText.trim()
        ? "Text extracted"
        : ocrCompleted
          ? "No text found; AI will read image"
          : processingStage === "parsing" || processingStage === "complete"
            ? "OCR unavailable; AI will read image"
            : "Waiting";
  const parsingStatus =
    processingStage === "parsing"
      ? "In progress"
      : processingStage === "complete"
        ? "Complete"
        : processingStage === "error"
          ? "Failed · retry available"
          : "Waiting";
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
        setCameraError("Camera access requires a secure HTTPS connection.");
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("This browser does not support camera access.");
        setCameraError("This browser does not support camera access.");
        return;
      }

      setStatus("Opening camera...");
      setCameraError(null);

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
      setReceiptDocumentDataUrl(null);
      setReceiptPdfFile(null);
      setReceiptDocumentName("");
      setProcessingStage("idle");
      setOcrCompleted(false);
      setDetectedWords([]);
      setReceiptRows([]);
      setReceiptTotals({ subtotal: "", tax: "", tip: "", total: "" });
      setReceiptTotalEdited(false);
      setAiParsed(false);
      setAiError("");
      setSplitAssignments([]);
      setUserNames([]);
      setUserNameInput("");
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
      const message =
        deviceId &&
        errorName !== "NotAllowedError" &&
        errorName !== "SecurityError"
          ? "Could not switch cameras. Try reopening the camera."
          : cameraErrorMessage;
      setStatus(message);
      setCameraError(message);
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
    setReceiptDocumentDataUrl(imageUrl);
    setReceiptPdfFile(null);
    setReceiptDocumentName("Camera receipt");
    setProcessingStage("idle");
    setOcrCompleted(false);
    setProgress(0);
    setAiError("");
    setExtractedText("");
    setReceiptRows([]);
    setReceiptTotals({ subtotal: "", tax: "", tip: "", total: "" });
    setReceiptTotalEdited(false);
    setStatus("Receipt captured. Select Extract text to start reading it.");
    stopCamera();
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
    let receiptText = "";

    try {
      setProcessingStage("extracting");
      setOcrCompleted(false);
      setStatus("Locating the receipt and reading its text...");
      setProgress(0);
      setExtractedText("");
      setAiError("");
      setReceiptRows([]);
      setReceiptTotals({ subtotal: "", tax: "", tip: "", total: "" });
      setReceiptTotalEdited(false);
      setAiParsed(false);
      setSplitAssignments([]);
      setUserNames([]);
      setUserNameInput("");

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

      receiptText = result.data.text;
      setExtractedText(receiptText);
      setOcrCompleted(true);
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
          ? "Text extracted. Organizing receipt items and totals..."
          : "No text was detected. Trying to read the receipt image with AI..."
      );
    } catch (error) {
      console.error(error);
      setOcrCompleted(false);
      setStatus("Text extraction failed. Trying to read the receipt image with AI...");
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch (error) {
          console.error(error);
          setStatus("Could not stop receipt text detection cleanly.");
        }
      }

      await parseWithAi(receiptText, imageUrl);
    }
  }

  async function extractText() {
    if (!frozenImage) return;
    await readImage(frozenImage);
  }

  async function uploadReceipt(file: File) {
    const supportedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];
    if (!supportedTypes.includes(file.type)) {
      setAiError("Choose a JPEG, PNG, WebP, or PDF receipt file.");
      return;
    }
    if (file.type === "application/pdf" && file.size > MAX_PDF_BYTES) {
      setAiError("PDF receipts must be 4 MB or smaller. Please choose a smaller PDF.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setAiError("Receipt files must be 8 MB or smaller.");
      return;
    }

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === "string"
            ? resolve(reader.result)
            : reject(new Error("Could not read the selected receipt file."));
        reader.onerror = () =>
          reject(new Error("Could not read the selected receipt file."));
        reader.readAsDataURL(file);
      });

      stopCamera();
      setReceiptDocumentDataUrl(dataUrl);
      setReceiptPdfFile(file.type === "application/pdf" ? file : null);
      setReceiptDocumentName(file.name);
      setProcessingStage(
        file.type === "application/pdf" ? "parsing" : "idle"
      );
      setOcrCompleted(false);
      setProgress(0);
      setDetectedWords([]);
      setFrameSize({ width: 0, height: 0 });
      setAiError("");
      setAiParsed(false);
      setReceiptRows([]);
      setReceiptTotals({ subtotal: "", tax: "", tip: "", total: "" });
      setReceiptTotalEdited(false);
      setSplitAssignments([]);
      setUserNames([]);
      setUserNameInput("");
      setTipOptionsOpen(false);
      setTipSplitMode("proportional");
      setManualTipAmounts({});

      if (file.type === "application/pdf") {
        setFrozenImage(null);
        setExtractedText("");
        setStatus("PDF uploaded. Organizing receipt items and totals...");
        await parseWithAi("", dataUrl, file);
      } else {
        setFrozenImage(dataUrl);
        setStatus("Receipt image uploaded. Select Extract text to start reading it.");
      }
    } catch (error) {
      console.error(error);
      setAiError(
        error instanceof Error
          ? error.message
          : "Could not read the selected receipt file."
      );
    }
  }

  async function parseWithAi(
    receiptText: string,
    documentDataUrl: string | null,
    pdfFile: File | null = null
  ) {
    if (!documentDataUrl || aiParsing) return;

    setAiParsing(true);
    setProcessingStage("parsing");
    setAiError("");
    setStatus("Organizing receipt items and totals with AI...");
    try {
      const headers = new Headers();
      let body: BodyInit;
      if (pdfFile) {
        const formData = new FormData();
        formData.set("receiptText", receiptText);
        formData.set("receiptFile", pdfFile);
        body = formData;
      } else {
        headers.set("Content-Type", "application/json");
        body = JSON.stringify({
          receiptText,
          imageDataUrl: documentDataUrl,
        });
      }
      const response = await fetch("/api/parse-receipt", {
        method: "POST",
        headers,
        body,
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

      if (result.items.length === 0) {
        const message =
          "No receipt data was found. Please reupload a clear receipt image or PDF and try again.";
        setProcessingStage("error");
        setAiError(message);
        setStatus(message);
        return;
      }

      setReceiptRows(result.items);
      setReceiptTotals(result.totals);
      setReceiptTotalEdited(false);
      setAiParsed(true);
      setItemAssignmentsOpen(false);
      setSplitAssignments([]);
      setUserNames([]);
      setUserNameInput("");
      setTipOptionsOpen(false);
      setTipSplitMode("proportional");
      setManualTipAmounts({});
      setProcessingStage("complete");
      setStatus("AI parsed the receipt. Review and edit the results as needed.");
    } catch (error) {
      console.error(error);
      setProcessingStage("error");
      setAiError(
        error instanceof Error
          ? error.message
          : "AI parsing failed. Please try again."
      );
      setStatus("AI parsing failed. Check the error and retry.");
    } finally {
      setAiParsing(false);
    }
  }

  function addUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = userNameInput.trim();
    if (!name) return;
    if (
      userNames.some(
        (existingName) => existingName.toLocaleLowerCase() === name.toLocaleLowerCase()
      )
    ) {
      setUserNameInput("");
      return;
    }
    setUserNames((names) => [...names, name]);
    setUserNameInput("");
  }

  function toggleItemAssignment(itemIndex: number, person: string) {
    setSplitAssignments((assignments) => {
      const existing = assignments.find(
        (assignment) => assignment.itemIndex === itemIndex
      );
      const alreadyAssigned = existing?.people.some(
        (name) => name.toLocaleLowerCase() === person.toLocaleLowerCase()
      );
      const people = alreadyAssigned
        ? (existing?.people ?? []).filter(
            (name) => name.toLocaleLowerCase() !== person.toLocaleLowerCase()
          )
        : [...(existing?.people ?? []), person];

      return people.length === 0
        ? assignments.filter((assignment) => assignment.itemIndex !== itemIndex)
        : [
            ...assignments.filter(
              (assignment) => assignment.itemIndex !== itemIndex
            ),
            { itemIndex, people },
          ].sort((left, right) => left.itemIndex - right.itemIndex);
    });
  }

  function retake() {
    setFrozenImage(null);
    setReceiptDocumentDataUrl(null);
    setReceiptPdfFile(null);
    setReceiptDocumentName("");
    setProcessingStage("idle");
    setOcrCompleted(false);
    setExtractedText("");
    setReceiptRows([]);
    setReceiptTotals({ subtotal: "", tax: "", tip: "", total: "" });
    setReceiptTotalEdited(false);
    setAiParsed(false);
    setAiError("");
    setSplitAssignments([]);
    setUserNames([]);
    setUserNameInput("");
    setProgress(0);
  }

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const step: 1 | 2 | 3 =
    aiParsed && receiptRows.length > 0 ? 3 : receiptDocumentDataUrl ? 2 : 1;
  const isProcessing =
    processingStage === "extracting" || processingStage === "parsing";
  const ocrState: ProcState = isPdfReceipt
    ? "done"
    : processingStage === "extracting"
      ? "running"
      : ocrCompleted
        ? "done"
        : processingStage === "parsing" ||
            processingStage === "complete" ||
            processingStage === "error"
          ? "error"
          : "waiting";
  const aiState: ProcState =
    processingStage === "parsing"
      ? "running"
      : processingStage === "complete"
        ? "done"
        : processingStage === "error"
          ? "error"
          : "waiting";
  const ocrDetail =
    ocrState === "waiting"
      ? "Reads every line on the receipt"
      : ocrState === "done" && !isPdfReceipt && extractedText.trim()
        ? "Text found"
        : extractionStatus;
  const aiDetail =
    aiState === "waiting" || aiState === "done"
      ? "Matches prices to items with AI"
      : parsingStatus;
  const liveText =
    cameraOn || status === "Opening camera..."
      ? status
      : "Turn on the camera, or upload a photo below.";
  const assignedCount = splitAssignments.filter(
    (assignment) => assignment.people.length > 0
  ).length;

  // Items should add up to the subtotal (within a cent) before anyone is charged.
  const itemsCents = splitCalculation.lines.reduce<number | null>(
    (sum, line) =>
      sum === null || line.amountCents === null ? null : sum + line.amountCents,
    0
  );
  const subtotalText = calculateReceiptTotal({
    subtotal: receiptTotals.subtotal,
    tax: "",
    tip: "",
    total: "",
  });
  const subtotalCents = subtotalText
    ? Math.round(Number(subtotalText.replace("$", "")) * 100)
    : null;
  const itemsMatch =
    itemsCents !== null &&
    subtotalCents !== null &&
    Math.abs(itemsCents - subtotalCents) <= 1;

  const title =
    step === 1
      ? "Scan the receipt"
      : step === 2
        ? isProcessing
          ? "Reading your receipt"
          : "Read the receipt"
        : "Check the items";
  const meta =
    step === 1
      ? "Fit the whole receipt inside the frame, keep it flat and well lit, then take the photo."
      : step === 2
        ? isProcessing
          ? "This usually takes a few seconds. You can check and fix everything on the next step."
          : "Looks good? Read it to find the items and totals."
        : "Compare with your photo and fix anything that’s off. Then assign the items.";

  function openUpload() {
    receiptFileInputRef.current?.click();
  }

  // PDFs skip OCR, and a failed AI pass after good OCR only needs the AI step again.
  function readReceipt() {
    if (isPdfReceipt || (processingStage === "error" && ocrCompleted)) {
      void parseWithAi(extractedText, receiptDocumentDataUrl, receiptPdfFile);
      return;
    }
    void extractText();
  }

  function updateRow(index: number, field: keyof AiReceiptItem, value: string) {
    setReceiptRows((currentRows) =>
      currentRows.map((currentRow, rowIndex) =>
        rowIndex === index ? { ...currentRow, [field]: value } : currentRow
      )
    );
  }

  function removeRow(index: number) {
    setReceiptRows((currentRows) =>
      currentRows.filter((_, rowIndex) => rowIndex !== index)
    );
    // Assignments point at item positions, so shift the ones after the removed row.
    setSplitAssignments((assignments) =>
      assignments
        .filter((assignment) => assignment.itemIndex !== index)
        .map((assignment) =>
          assignment.itemIndex > index
            ? { ...assignment, itemIndex: assignment.itemIndex - 1 }
            : assignment
        )
    );
  }

  function addRow() {
    setReceiptRows((currentRows) => [
      ...currentRows,
      { quantity: "1", description: "", amount: "" },
    ]);
  }

  function updateTotal(field: "subtotal" | "tax" | "tip", value: string) {
    setReceiptTotalEdited(true);
    setReceiptTotals((currentTotals) => ({ ...currentTotals, [field]: value }));
  }

  const photoCard = (
    <section className="sec">
      <h2 className="sh">Your photo</h2>
      <div className="shot">
        {isPdfReceipt ? (
          <div>
            <b>PDF</b>
            <small>{receiptDocumentName}</small>
          </div>
        ) : (
          frozenImage && <img src={frozenImage} alt="Your receipt" />
        )}
      </div>
      <div className="acts2">
        <button className="btn line" type="button" onClick={retake}>
          <RetakeIcon />
          Retake
        </button>
        {step === 3 ? (
          <button className="btn txt" type="button" onClick={readReceipt} disabled={isProcessing}>
            Read again
          </button>
        ) : (
          <button className="btn txt" type="button" onClick={openUpload}>
            <UploadIcon />
            Upload instead
          </button>
        )}
      </div>
    </section>
  );

  return (
    <div className="db">
      <Sidebar />
      <main className="main">
        <div className="wrap">
          <Link className="back" href="/dashboard/item-by-item">
            <BackIcon />
            Item by item
          </Link>
          <header>
            <h1>{title}</h1>
            <p className="meta">{meta}</p>
          </header>
          <Steps current={step} />
          {aiError && (
            <p className="msg err" role="alert">
              {aiError}
            </p>
          )}

          {/* Capture canvas and file input stay mounted on every step. */}
          <canvas ref={canvasRef} hidden />
          <input
            ref={receiptFileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="sr"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void uploadReceipt(file);
            }}
          />

          {step === 1 && (
            <div className="grid2">
              <section className="sec" aria-label="Camera">
                <div className="vf">
                  <video ref={videoRef} playsInline muted autoPlay />
                  {cameraOn && detectedWords.length > 0 && frameSize.width > 0 && (
                    <svg
                      aria-hidden="true"
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
                      viewBox={`0 0 ${frameSize.width} ${frameSize.height}`}
                      preserveAspectRatio="xMidYMid slice"
                    >
                      {detectedWords.map(({ text, bbox }, index) => (
                        <g key={`${bbox.x0}-${bbox.y0}-${index}`}>
                          <rect
                            x={bbox.x0}
                            y={bbox.y0}
                            width={bbox.x1 - bbox.x0}
                            height={bbox.y1 - bbox.y0}
                            fill="rgba(46, 242, 166, 0.12)"
                            stroke="#2EF2A6"
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
                  {cameraOn ? (
                    <>
                      <span className="corner c1" />
                      <span className="corner c2" />
                      <span className="corner c3" />
                      <span className="corner c4" />
                      <span className="vf-hint">Hold steady</span>
                    </>
                  ) : (
                    <div className="vf-empty">
                      <span>{cameraError ?? "The camera is off."}</span>
                      <button
                        className="btn line"
                        type="button"
                        onClick={() => void startCamera()}
                        disabled={switchingCamera || status === "Opening camera..."}
                      >
                        <CameraIcon />
                        Turn on camera
                      </button>
                    </div>
                  )}
                </div>
                <p className={`live${cameraOn ? "" : " idle"}`} role="status">
                  <i />
                  {liveText}
                </p>
                <div className="ctrl">
                  <button className="btn lg" type="button" onClick={freezeFrame} disabled={!cameraOn}>
                    <CameraIcon />
                    Take photo
                  </button>
                  <button
                    className="btn line"
                    type="button"
                    onClick={() => void flipCamera()}
                    disabled={!cameraOn || switchingCamera}
                  >
                    <SwitchIcon />
                    {switchingCamera ? "Switching camera..." : "Switch camera"}
                  </button>
                  <span className="sp" />
                  {cameraOn && (
                    <button className="btn txt" type="button" onClick={stopCamera}>
                      Turn off camera
                    </button>
                  )}
                </div>
                <p className="or">or</p>
                <div className="drop">
                  <div>
                    <b>Already have a photo?</b>
                    <small>Upload a JPG, PNG, WebP or PDF of the receipt.</small>
                  </div>
                  <button className="btn line" type="button" onClick={openUpload}>
                    <UploadIcon />
                    Upload a photo or PDF
                  </button>
                </div>
              </section>
              <aside className="col" aria-label="Tips">
                <section className="sec">
                  <h2 className="sh">For the best scan</h2>
                  <ul className="tips">
                    <li><span className="ic"><FlatIcon /></span><div><b>Lay it flat</b><small>Smooth out folds and curls.</small></div></li>
                    <li><span className="ic"><BulbIcon /></span><div><b>Good light, no glare</b><small>Avoid shadows across the prices.</small></div></li>
                    <li><span className="ic"><FrameIcon /></span><div><b>Whole receipt in frame</b><small>From the store name down to the total.</small></div></li>
                  </ul>
                </section>
              </aside>
            </div>
          )}

          {step === 2 && (
            <div className="grid2">
              <section
                className="sec"
                aria-labelledby="p-h"
                aria-live="polite"
                aria-busy={isProcessing}
              >
                <div className="shead">
                  <h2 id="p-h">{isProcessing ? "Working on it" : "Ready to read"}</h2>
                  <p className="sub">{receiptDocumentName || "Your receipt photo"}</p>
                </div>
                <ul className="proc">
                  <ProcRow n={1} state={ocrState} title="Read the receipt text" detail={ocrDetail} />
                  <ProcRow n={2} state={aiState} title="Find the items and totals" detail={aiDetail} />
                  <ProcRow n={3} state="waiting" title="Check the items" detail="Opens when the items are ready" />
                </ul>
                <p className="ai-note">
                  <SparkIcon />
                  <span>
                    {isPdfReceipt
                      ? "The PDF (up to 4 MB) is sent to Gemini to find the items and totals. Always check the results against the receipt."
                      : "The photo and its text are sent to Gemini to find the items and totals. Always check the results against the receipt."}
                  </span>
                </p>
                <div className="acts2">
                  {isProcessing ? (
                    <button className="btn lg" type="button" disabled>
                      Reading…
                    </button>
                  ) : (
                    <button className="btn lg" type="button" onClick={readReceipt}>
                      {processingStage === "error" ? "Read again" : "Read receipt"}
                    </button>
                  )}
                </div>
              </section>
              <aside className="col" aria-label="Your photo">
                {photoCard}
              </aside>
            </div>
          )}

          {step === 3 && (
            <>
              <div className="grid2">
                <section className="sec" aria-labelledby="i-h">
                  <div className="shead">
                    <h2 id="i-h">Items on the receipt</h2>
                    <p className="sub">
                      {receiptRows.length} {receiptRows.length === 1 ? "item" : "items"} found. Tap any field to edit it.
                    </p>
                  </div>
                  <ul>
                    <li className="ir ih" aria-hidden="true">
                      <span style={{ textAlign: "center" }}>Qty</span>
                      <span>Item</span>
                      <span style={{ textAlign: "right" }}>Price</span>
                      <span />
                    </li>
                    {receiptRows.map((row, index) => (
                      <li key={index} className="ir">
                        <input
                          className="field qty"
                          type="text"
                          inputMode="numeric"
                          aria-label={`Quantity for row ${index + 1}`}
                          value={row.quantity}
                          onChange={(event) => updateRow(index, "quantity", event.target.value)}
                        />
                        <input
                          className="field"
                          type="text"
                          aria-label={`Description for row ${index + 1}`}
                          value={row.description}
                          onChange={(event) => updateRow(index, "description", event.target.value)}
                        />
                        <div className="money-in">
                          <span aria-hidden="true">$</span>
                          <input
                            className="field num"
                            type="text"
                            inputMode="decimal"
                            aria-label={`Amount for row ${index + 1}`}
                            value={row.amount}
                            onChange={(event) => updateRow(index, "amount", event.target.value)}
                          />
                        </div>
                        <button
                          className="xb"
                          type="button"
                          aria-label={`Delete ${row.description || "item"}`}
                          onClick={() => removeRow(index)}
                        >
                          <CloseIcon />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button className="addline" type="button" onClick={addRow}>
                    <PlusIcon />
                    Add a missing item
                  </button>
                  <div className="tots">
                    <div>
                      <label className="lbl" htmlFor="st">Subtotal</label>
                      <div className="money-in">
                        <span aria-hidden="true">$</span>
                        <input id="st" className="field" type="text" inputMode="decimal" value={receiptTotals.subtotal} onChange={(event) => updateTotal("subtotal", event.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="lbl" htmlFor="tx">Tax</label>
                      <div className="money-in">
                        <span aria-hidden="true">$</span>
                        <input id="tx" className="field" type="text" inputMode="decimal" value={receiptTotals.tax} onChange={(event) => updateTotal("tax", event.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="lbl" htmlFor="tp">Tip</label>
                      <div className="money-in">
                        <span aria-hidden="true">$</span>
                        <input id="tp" className="field" type="text" inputMode="decimal" placeholder="0.00" value={receiptTotals.tip} onChange={(event) => updateTotal("tip", event.target.value)} />
                      </div>
                    </div>
                    <div>
                      <p className="lbl">Total</p>
                      <div className="tot-out" aria-live="polite">{displayedReceiptTotal}</div>
                    </div>
                  </div>
                  <p className={`check${itemsMatch ? "" : " warn"}`}>
                    {itemsMatch ? (
                      <>
                        <CheckIcon />
                        Items add up to the subtotal. The total updates when you change subtotal, tax or tip.
                      </>
                    ) : (
                      "Items don’t add up to the subtotal yet. Check the prices against your photo."
                    )}
                  </p>
                  <Suspense fallback={null}>
                    <SaveReceiptButton rows={receiptRows} />
                  </Suspense>
                </section>
                <aside className="col" aria-label="Your receipt">
                  {photoCard}
                  {extractedText && (
                    <section className="sec">
                      <details className="raw">
                        <summary>
                          Text from the photo<span className="ptag">Show</span>
                        </summary>
                        <pre>{extractedText}</pre>
                        <button className="btn line" type="button" onClick={() => navigator.clipboard.writeText(extractedText)}>
                          <CopyIcon />
                          Copy text
                        </button>
                      </details>
                    </section>
                  )}
                </aside>
              </div>

              <section className="sec" aria-labelledby="n-h">
                <h2 id="n-h">Assign items</h2>
                <button
                  className="opt2"
                  type="button"
                  aria-expanded={itemAssignmentsOpen}
                  aria-controls="interactive-item-assignments"
                  onClick={() => setItemAssignmentsOpen((open) => !open)}
                >
                  <span className="oic"><PeopleIcon /></span>
                  <span>
                    <b>{itemAssignmentsOpen ? "Hide item assignments" : "Assign items yourself"}</b>
                    <span className="d">Pick who had each item, like a shared list.</span>
                    <small>{assignedCount} of {receiptRows.length} assigned</small>
                  </span>
                  <ChevIcon />
                </button>

                {itemAssignmentsOpen && (
                  <div id="interactive-item-assignments">
                    <p className="sub">Add people, then pick who had each item. Shared items split evenly.</p>
                    <form onSubmit={addUser}>
                      <label htmlFor="user-name" className="lbl">Add a person</label>
                      <div className="inrow">
                        <input
                          id="user-name"
                          className="field"
                          value={userNameInput}
                          onChange={(event) => setUserNameInput(event.target.value)}
                          maxLength={40}
                          placeholder="[Friend name]"
                        />
                        <button className="btn" type="submit" disabled={!userNameInput.trim()}>
                          Add
                        </button>
                      </div>
                    </form>

                    <p className="lbl">Who had each item</p>
                    <ul className="proc">
                      {receiptRows.map((row, index) => {
                        const assignment = splitAssignments.find(
                          (entry) => entry.itemIndex === index
                        );
                        const line = splitCalculation.lines[index];
                        return (
                          <li key={`assignment-${index}`}>
                            <span className="pst">{index + 1}</span>
                            <div>
                              <b>
                                {row.quantity.trim() ? `${row.quantity.trim()} × ` : ""}
                                {row.description || `Receipt item ${index + 1}`}
                              </b>
                              <small aria-live="polite">
                                {line.amountCents === null
                                  ? "Check this item's amount before splitting."
                                  : line.shares.length > 0
                                    ? line.shares
                                        .map((share) => `${share.person}: ${formatCents(share.amountCents)}`)
                                        .join(", ")
                                    : "Unassigned"}
                              </small>
                              {userNames.length > 0 ? (
                                <div
                                  className="seg"
                                  role="group"
                                  aria-label={`Assign ${row.description || `item ${index + 1}`} to people`}
                                >
                                  {userNames.map((person) => {
                                    const selected =
                                      assignment?.people.some(
                                        (name) => name.toLocaleLowerCase() === person.toLocaleLowerCase()
                                      ) ?? false;
                                    return (
                                      <button
                                        key={person}
                                        className={`sg${selected ? " on" : ""}`}
                                        type="button"
                                        aria-pressed={selected}
                                        onClick={() => toggleItemAssignment(index, person)}
                                      >
                                        {person}
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : (
                                <small>Add people above to assign this item.</small>
                              )}
                            </div>
                            <span className="ptag">{row.amount.trim() || "Amount needs review"}</span>
                          </li>
                        );
                      })}
                    </ul>

                    <p className="lbl">Each person’s share</p>
                    {splitCalculation.people.length > 0 ? (
                      <ul className="proc">
                        {splitCalculation.people.map((person) => (
                          <li key={person.person.toLocaleLowerCase()}>
                            <span className="av p1" aria-hidden="true">
                              {person.person.trim().charAt(0).toUpperCase()}
                            </span>
                            <div>
                              <b>{person.person}</b>
                              <small>
                                Items {formatCents(person.itemsCents)}, tax {formatCents(person.taxCents)}, tip {formatCents(person.tipCents)}
                              </small>
                            </div>
                            <span className="ptag ok">
                              {formatCents(person.itemsCents + person.taxCents + person.tipCents)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="sub">Add people and assign items to see everyone’s share.</p>
                    )}
                    {splitCalculation.unassignedCents > 0 && (
                      <p className="msg">
                        Unassigned items:{" "}
                        {formatCents(
                          splitCalculation.unassignedCents +
                            splitCalculation.unassignedTaxCents +
                            splitCalculation.unassignedTipCents
                        )}
                        . Their share of tax and tip stays unassigned too.
                      </p>
                    )}
                    {!splitCalculation.canAllocateTaxAndTip && (
                      <p className="msg">
                        Enter a valid, non-negative amount for every item to allocate tax and tip proportionally.
                      </p>
                    )}

                    <div className="acts2">
                      <button
                        className="btn line"
                        type="button"
                        aria-expanded={tipOptionsOpen}
                        onClick={() => setTipOptionsOpen((open) => !open)}
                      >
                        {tipOptionsOpen ? "Hide tip options" : "Tip options"}
                        {`: ${
                          tipSplitMode === "proportional"
                            ? "Split proportionally"
                            : tipSplitMode === "manual"
                              ? "Custom per person"
                              : "Not included"
                        }`}
                      </button>
                    </div>
                    {tipOptionsOpen && (
                      <div>
                        <p className="sub">Tax stays proportional. Choose how the tip is handled.</p>
                        <p className="lbl">Tip</p>
                        <div className="seg" role="group" aria-label="Tip split">
                          {(
                            [
                              ["proportional", "Split proportionally"],
                              ["manual", "Set each person’s tip"],
                              ["disabled", "Don’t split tip"],
                            ] as const
                          ).map(([mode, label]) => (
                            <button
                              key={mode}
                              className={`sg${tipSplitMode === mode ? " on" : ""}`}
                              type="button"
                              aria-pressed={tipSplitMode === mode}
                              onClick={() => selectTipSplitMode(mode)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        {tipSplitMode === "manual" && (
                          <div>
                            <p className="sub">Enter each person’s tip. These amounts replace the receipt tip allocation.</p>
                            {splitCalculation.people.length === 0 && (
                              <p className="sub">Assign items above to set each person’s tip.</p>
                            )}
                            {splitCalculation.people.map((person) => {
                              const key = person.person.toLowerCase();
                              return (
                                <div key={key}>
                                  <label className="lbl" htmlFor={`tip-${key}`}>{person.person}</label>
                                  <div className="money-in">
                                    <span aria-hidden="true">$</span>
                                    <input
                                      id={`tip-${key}`}
                                      className="field"
                                      type="text"
                                      inputMode="decimal"
                                      value={
                                        manualTipAmounts[key] ??
                                        ((
                                          proportionalTipCalculation.people.find(
                                            (entry) => entry.person.toLowerCase() === key
                                          )?.tipCents ?? 0
                                        ) / 100).toFixed(2)
                                      }
                                      onChange={(event) =>
                                        setManualTipAmounts((amounts) => ({
                                          ...amounts,
                                          [key]: event.target.value,
                                        }))
                                      }
                                    />
                                  </div>
                                </div>
                              );
                            })}
                            {splitCalculation.unassignedCents > 0 && (
                              <div>
                                <label className="lbl" htmlFor="tip-unassigned">Unassigned items</label>
                                <div className="money-in">
                                  <span aria-hidden="true">$</span>
                                  <input
                                    id="tip-unassigned"
                                    className="field"
                                    type="text"
                                    inputMode="decimal"
                                    value={
                                      manualTipAmounts.__unassigned__ ??
                                      (proportionalTipCalculation.unassignedTipCents / 100).toFixed(2)
                                    }
                                    onChange={(event) =>
                                      setManualTipAmounts((amounts) => ({
                                        ...amounts,
                                        __unassigned__: event.target.value,
                                      }))
                                    }
                                  />
                                </div>
                              </div>
                            )}
                            {splitCalculation.manualTipNeedsReview && (
                              <p className="msg err" role="alert">
                                Enter a valid non-negative amount for each tip share. Invalid amounts are not included in the totals.
                              </p>
                            )}
                          </div>
                        )}
                        {tipSplitMode === "disabled" && (
                          <p className="sub">The receipt tip will not be included in anyone’s total.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

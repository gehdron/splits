
"use client";

import Link from "next/link";
import {
  Suspense,
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { signOut } from "../../auth/actions";
import { createListFromReceipt, importReceipt } from "../actions";
import Tesseract from "tesseract.js";
import "./item-by-item.css";
import type {
  AiParsedReceipt,
  AiReceiptItem,
  AiReceiptTotals,
} from "@/app/receipt-types";
import {
  calculateReceiptTotal,
  calculateReceiptSplits,
} from "@/app/split-calculations";

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
    (!("merchant" in value) || typeof value.merchant === "string") &&
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
const CameraIcon = () => <Svg><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></Svg>;
const UploadIcon = () => <Svg><path d="M12 15V4M7 9l5-5 5 5" /><path d="M5 15v4h14v-4" /></Svg>;
const SwitchIcon = () => <Svg><path d="M4 10a8 8 0 0 1 14-4l2 2M20 14a8 8 0 0 1-14 4l-2-2" /><path d="M20 4v4h-4M4 20v-4h4" /></Svg>;
const RetakeIcon = () => <Svg><path d="M4 12a8 8 0 1 0 3-6.2" /><path d="M4 4v5h5" /></Svg>;
const CopyIcon = () => <Svg><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a1 1 0 0 1 1-1h10" /></Svg>;
const SparkIcon = () => <Svg><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></Svg>;
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

export type ScannerGroup = { id: string; name: string; role: "owner" | "member" };
export type ScannerCharge = { merchant: string; amount: string; date: string };
type ScannerProps = {
  me: { name: string; email: string } | null;
  groups: ScannerGroup[];
  group: ScannerGroup | null;
  people: string[];
  charge: ScannerCharge | null;
  loadError: string | null;
  startCameraOnLoad?: boolean;
};

// The AI returns amounts as text ("36.97" or "$36.97"); show them with one leading "$". Display only.
const withDollar = (amount: string) => {
  const value = amount.trim();
  return !value || value.startsWith("$") || value.startsWith("-$") ? value : `$${value}`;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = (parts[0] ?? "?").charAt(0);
  const last = parts.length > 1 ? (parts[parts.length - 1] ?? "").charAt(0) : "";
  return (first + last).toUpperCase();
}

function ReceiptImage({
  src,
  width,
  height,
  words,
  alt,
}: {
  src: string;
  width: number;
  height: number;
  words: DetectedWord[];
  alt: string;
}) {
  return (
    <div
      className="receipt-image"
      style={width > 0 && height > 0 ? { aspectRatio: `${width} / ${height}` } : undefined}
    >
      <img src={src} alt={alt} draggable={false} />
      {width > 0 && height > 0 && words.length > 0 && (
        <svg
          aria-hidden="true"
          className="receipt-image-words"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid slice"
        >
          {words.map(({ text, bbox }, index) => (
            <g key={`${bbox.x0}-${bbox.y0}-${index}`}>
              <rect
                x={bbox.x0}
                y={bbox.y0}
                width={bbox.x1 - bbox.x0}
                height={bbox.y1 - bbox.y0}
                fill="rgba(46, 242, 166, 0.12)"
                stroke="#2EF2A6"
                strokeWidth={Math.max(2, width / 500)}
              />
              <text
                x={bbox.x0 + 2}
                y={Math.max(bbox.y0 - 4, 12)}
                fill="#86efac"
                fontSize={Math.max(8, Math.min(24, (bbox.y1 - bbox.y0) * 0.55))}
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
    </div>
  );
}

function colorClass(name: string): string {
  let h = 0;
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `p${1 + (h % 3)}`;
}

function Sidebar({ me, groups, group, people, loadError }: Omit<ScannerProps, "charge">) {
  return (
    <aside className="side">
      <Link className="brand" href="/" aria-label="Splits home"><LogoMark /><span>Splits</span></Link>
      <section aria-labelledby="g-h">
        <h2 className="sh" id="g-h">Your groups</h2>
        {loadError ? (
          <p className="sub">We couldn’t load your groups. Reload the page to try again.</p>
        ) : groups.length === 0 ? (
          <p className="sub">{me ? "No group yet. You can still split this receipt." : "Sign in to split with a group."}</p>
        ) : (
          <ul>
            {groups.map((g) => {
              const on = g.id === group?.id;
              return (
                <li key={g.id}>
                  <a className={`gbtn${on ? " on" : ""}`} href={`/dashboard?group=${encodeURIComponent(g.id)}`} aria-current={on ? "page" : undefined}>
                    <span>{g.name}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {group ? (
        <section aria-labelledby="f-h">
          <h2 className="sh" id="f-h">People in {group.name}</h2>
          <ul>
            {people.map((name) => (
              <li key={name} className="fr">
                <span className={`av ${colorClass(name)}`} aria-hidden="true">{initials(name)}</span>
                <div><b>{name}</b><small>In {group.name}</small></div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="me">
        {me ? (
          <>
            <Link className="meav" href="/account" aria-label="Account">
              <span className="av lgav p0" aria-hidden="true">{initials(me.name)}</span>
            </Link>
            <div><b>{me.name}</b><small>{me.email}</small></div>
            <form action={signOut}><button className="btn txt" type="submit">Sign out</button></form>
          </>
        ) : (
          <>
            <span className="av lgav p0" aria-hidden="true">?</span>
            <div><b>Not signed in</b><small>Sign in to save to a group.</small></div>
            <Link className="btn txt" href="/login">Sign in</Link>
          </>
        )}
      </div>
    </aside>
  );
}

function SaveReceiptButton({
  rows,
  group,
  listName,
  merchant,
  onMerchantChange,
  receiptTotals,
  displayedReceiptTotal,
}: {
  rows: AiReceiptItem[];
  group: ScannerGroup | null;
  listName: string;
  merchant: string;
  onMerchantChange: (merchant: string) => void;
  receiptTotals: AiReceiptTotals;
  displayedReceiptTotal: string;
}) {
  const params = useSearchParams();
  const listId = params.get("list");
  const [importState, importAction, importPending] = useActionState(importReceipt, undefined);
  const [createState, createAction, createPending] = useActionState(createListFromReceipt, undefined);
  const [customName, setCustomName] = useState(listName && listName !== "Receipt" ? listName : "");
  const [nameSuggestion, setNameSuggestion] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestionError, setSuggestionError] = useState("");

  async function suggestName() {
    setSuggesting(true);
    setSuggestionError("");
    try {
      const res = await fetch("/api/suggest-list-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: rows.map((r) => r.description),
          merchant: merchant || undefined,
        }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
            ? data.error
            : "Gemini could not suggest a list name.";
        throw new Error(message);
      }
      if (
        typeof data === "object" &&
        data !== null &&
        "name" in data &&
        typeof data.name === "string" &&
        data.name.trim()
      ) {
        setNameSuggestion(data.name.trim());
      } else {
        throw new Error("Gemini returned an invalid list name.");
      }
    } catch (error) {
      setSuggestionError(error instanceof Error ? error.message : "Gemini could not suggest a list name.");
    } finally {
      setSuggesting(false);
    }
  }

  if (!group || rows.length === 0) return null;
  // Only group owners can add lists and items (see supabase/schema.sql), so don't offer a save that can't work.
  if (group.role !== "owner") {
    return <p className="sub">Only the owner of {group.name} can save a receipt to the group. You can still assign the items here.</p>;
  }

  const pending = listId ? importPending : createPending;
  const state = listId ? importState : createState;
  return (
    <form action={listId ? importAction : createAction} className="acts2">
      <input type="hidden" name="groupId" value={group.id} />
      <div style={{ width: "100%", margin: "10px 0" }}>
        <label className="lbl" htmlFor="receipt-place">Place (optional)</label>
        <input
          id="receipt-place"
          className="field"
          name="merchant"
          value={merchant}
          maxLength={120}
          placeholder="Enter the store or restaurant"
          onChange={(event) => onMerchantChange(event.target.value)}
        />
        <p className="sub">We’ll try to read the place from your receipt. You can edit it here.</p>
      </div>
      <input type="hidden" name="receiptTotals" value={JSON.stringify({
        ...receiptTotals,
        total: displayedReceiptTotal,
      })} />
      {listId ? (
        <input type="hidden" name="listId" value={listId} />
      ) : (
        <div style={{ width: "100%", margin: "10px 0" }}>
          <label className="lbl" htmlFor="scanner-list-name">
            List name (required)
          </label>
          <div className="inrow" style={{ gap: 8, alignItems: "center" }}>
            <input
              id="scanner-list-name"
              className="field"
              name="name"
              value={customName}
              maxLength={80}
              placeholder="e.g. Olive Garden Dinner"
              required
              onChange={(e) => setCustomName(e.target.value)}
            />
            <button
              type="button"
              className="btn line"
              disabled={suggesting}
              onClick={suggestName}
            >
              {suggesting ? "Suggesting…" : "Suggest a name"}
            </button>
          </div>
          {nameSuggestion ? (
            <div className="acts2" role="status">
              <span>Suggestion: <strong>{nameSuggestion}</strong></span>
              <button
                type="button"
                className="btn line"
                onClick={() => {
                  setCustomName(nameSuggestion);
                  setNameSuggestion("");
                }}
              >
                Use suggestion
              </button>
            </div>
          ) : null}
        </div>
      )}
      <input type="hidden" name="items" value={JSON.stringify(rows)} />
      <button
        type="submit"
        disabled={pending || (!listId && !customName.trim())}
        className="btn lg"
      >
        {pending ? "Saving…" : listId ? "Add these items to the list" : `Save as a list in ${group.name}`}
      </button>
      {suggestionError ? <p className="msg err" role="alert">{suggestionError}</p> : null}
      {state?.error ? <p className="msg err" role="alert">{state.error}</p> : null}
    </form>
  );
}

export function ReceiptScanner({
  me,
  groups,
  group,
  people,
  charge,
  loadError,
  startCameraOnLoad = false,
}: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const receiptFileInputRef = useRef<HTMLInputElement>(null);
  const receiptViewportRef = useRef<HTMLDivElement>(null);
  const autoCameraStarted = useRef(false);
  const [enlargedImageOpen, setEnlargedImageOpen] = useState(false);
  const [receiptZoom, setReceiptZoom] = useState(1);
  const [receiptViewportSize, setReceiptViewportSize] = useState({ width: 0, height: 0 });

  const [cameraOn, setCameraOn] = useState(false);
  const [phoneOrientation, setPhoneOrientation] = useState<"portrait" | "landscape">("portrait");
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
  const [receiptMerchant, setReceiptMerchant] = useState(charge?.merchant ?? "");
  const [receiptTotals, setReceiptTotals] = useState<AiReceiptTotals>({
    subtotal: "",
    tax: "",
    tip: "",
    total: "",
  });
  const [receiptTotalEdited, setReceiptTotalEdited] = useState(false);
  const [aiParsing, setAiParsing] = useState(false);
  // Bumped whenever the photo changes, so a slow read of an old photo can't overwrite the new state.
  const readRun = useRef(0);
  const [aiParsed, setAiParsed] = useState(false);
  const [aiError, setAiError] = useState("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const query = window.matchMedia("(orientation: portrait)");
    const updateOrientation = () => {
      setPhoneOrientation(query.matches ? "portrait" : "landscape");
    };
    updateOrientation();
    query.addEventListener("change", updateOrientation);
    window.addEventListener("orientationchange", updateOrientation);
    return () => {
      query.removeEventListener("change", updateOrientation);
      window.removeEventListener("orientationchange", updateOrientation);
    };
  }, []);
  const isPdfReceipt = receiptDocumentDataUrl?.startsWith(
    "data:application/pdf;base64,"
  ) ?? false;

  const receiptCalculation = calculateReceiptSplits(receiptRows, receiptTotals, []);
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
  const startCamera = useCallback(async (
    facingMode: CameraFacingMode = cameraFacingMode,
    deviceId?: string
  ) => {
    let stream: MediaStream | null = null;
    readRun.current += 1;

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
  }, [cameraFacingMode]);

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
    readRun.current += 1;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || !video.videoWidth) {
      setStatus("Wait for the camera to load, then try again.");
      return;
    }

    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    const rotateForPortrait =
      phoneOrientation === "portrait" && sourceWidth > sourceHeight;
    const rotateForLandscape =
      phoneOrientation === "landscape" && sourceHeight > sourceWidth;
    const rotate = rotateForPortrait || rotateForLandscape;
    canvas.width = rotate ? sourceHeight : sourceWidth;
    canvas.height = rotate ? sourceWidth : sourceHeight;

    const context = canvas.getContext("2d");

    if (!context) {
      setStatus("Could not capture the image.");
      return;
    }

    if (rotate) {
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate(rotateForPortrait ? Math.PI / 2 : -Math.PI / 2);
      context.drawImage(video, -sourceWidth / 2, -sourceHeight / 2);
    } else {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
    }
    setFrameSize({ width: canvas.width, height: canvas.height });

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
    setStatus("Receipt captured. Reading its text now.");
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
    let receiptText = "";
    const run = ++readRun.current;
    const stale = () => run !== readRun.current;

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

      const image = new Image();
      image.src = imageUrl;
      await image.decode();
      setFrameSize({ width: image.naturalWidth, height: image.naturalHeight });

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

      if (stale()) return;
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

      if (!stale()) await parseWithAi(receiptText, imageUrl, null, run);
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

      readRun.current += 1;
      setAiParsing(false);
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

      if (file.type === "application/pdf") {
        setFrozenImage(null);
        setExtractedText("");
        setStatus("PDF uploaded. Organizing receipt items and totals...");
        await parseWithAi("", dataUrl, file);
      } else {
        setFrozenImage(dataUrl);
        setStatus("Receipt image uploaded. Reading its text now.");
        void readImage(dataUrl);
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
    pdfFile: File | null = null,
    run: number = readRun.current
  ) {
    if (!documentDataUrl || aiParsing || run !== readRun.current) return;

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
      if (run !== readRun.current) return;
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
      setReceiptMerchant(result.merchant?.trim() || charge?.merchant || "");
      setReceiptTotals(result.totals);
      setReceiptTotalEdited(false);
      setAiParsed(true);
      setProcessingStage("complete");
      setStatus("AI parsed the receipt. Review and edit the results as needed.");
    } catch (error) {
      console.error(error);
      if (run !== readRun.current) return;
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

  function retake() {
    readRun.current += 1;
    setAiParsing(false);
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
    setProgress(0);
  }

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (!startCameraOnLoad || autoCameraStarted.current) return;
    const timeoutId = window.setTimeout(() => {
      autoCameraStarted.current = true;
      void startCamera();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [startCamera, startCameraOnLoad]);

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

  const itemsCents = receiptCalculation.lines.reduce<number | null>(
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
          : processingStage === "error"
            ? "Receipt reading stopped"
            : "Preparing your receipt"
        : "Check the items";
  const meta =
    step === 1
      ? "Fit the whole receipt inside the frame, keep it flat and well lit, then take the photo."
      : step === 2
        ? isProcessing
          ? "This usually takes a few seconds. You can check and fix everything on the next step."
          : processingStage === "error"
            ? "Receipt reading did not finish. Try again or retake the photo."
            : "Receipt reading starts automatically."
        : "Compare with your photo and correct any item names, prices or totals.";

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
          frozenImage && (
            <button
              className="receipt-image-button"
              type="button"
              onClick={() => {
                setReceiptZoom(1);
                setEnlargedImageOpen(true);
              }}
              aria-label="Enlarge receipt image"
            >
              <ReceiptImage
                src={frozenImage}
                width={frameSize.width}
                height={frameSize.height}
                words={detectedWords}
                alt="Your receipt"
              />
              <span>Enlarge image</span>
            </button>
          )
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

  useEffect(() => {
    if (!enlargedImageOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setEnlargedImageOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enlargedImageOpen]);

  useEffect(() => {
    if (!enlargedImageOpen) return;
    const viewport = receiptViewportRef.current;
    if (!viewport) return;

    const resizeObserver = new ResizeObserver(([entry]) => {
      setReceiptViewportSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    resizeObserver.observe(viewport);
    return () => resizeObserver.disconnect();
  }, [enlargedImageOpen]);

  const receiptFitScale =
    frameSize.width > 0 &&
    frameSize.height > 0 &&
    receiptViewportSize.width > 0 &&
    receiptViewportSize.height > 0
      ? Math.min(
          receiptViewportSize.width / frameSize.width,
          receiptViewportSize.height / frameSize.height,
        )
      : 0;

  return (
    <div className="db">
      <Sidebar me={me} groups={groups} group={group} people={people} loadError={loadError} />
      <main className="main">
        {enlargedImageOpen && frozenImage && (
          <div
            className="receipt-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label="Enlarged receipt image"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setEnlargedImageOpen(false);
              }
            }}
          >
            <button
              className="receipt-lightbox-close"
              type="button"
              onClick={() => setEnlargedImageOpen(false)}
              aria-label="Close enlarged receipt image"
            >
              <CloseIcon />
            </button>
            <div className="receipt-lightbox-content">
              <div className="receipt-zoom-controls" role="group" aria-label="Receipt zoom controls">
                <button
                  className="receipt-zoom-button"
                  type="button"
                  aria-label="Zoom out"
                  onClick={() => setReceiptZoom((zoom) => Math.max(1, zoom - 0.5))}
                  disabled={receiptZoom <= 1}
                >
                  −
                </button>
                <button
                  className="receipt-zoom-level"
                  type="button"
                  onClick={() => setReceiptZoom(1)}
                  aria-label="Reset receipt zoom"
                >
                  {Math.round(receiptZoom * 100)}%
                </button>
                <button
                  className="receipt-zoom-button"
                  type="button"
                  aria-label="Zoom in"
                  onClick={() => setReceiptZoom((zoom) => Math.min(4, zoom + 0.5))}
                  disabled={receiptZoom >= 4}
                >
                  +
                </button>
              </div>
              <div
                className="receipt-lightbox-viewport"
                ref={receiptViewportRef}
                role="region"
                aria-label="Scrollable zoomed receipt image"
                tabIndex={0}
              >
                {receiptFitScale > 0 ? (
                  <div
                    className="receipt-lightbox-image"
                    style={{
                      width: frameSize.width * receiptFitScale * receiptZoom,
                      height: frameSize.height * receiptFitScale * receiptZoom,
                    }}
                  >
                    <ReceiptImage
                      src={frozenImage}
                      width={frameSize.width}
                      height={frameSize.height}
                      words={detectedWords}
                      alt="Enlarged receipt with detected text"
                    />
                  </div>
                ) : null}
              </div>
              <p>
                {detectedWords.length > 0
                  ? "Green outlines show detected text. Zoom in to inspect details, then scroll the image."
                  : "Text outlines appear after you extract text. Zoom in to inspect the receipt."}
              </p>
            </div>
          </div>
        )}
        <div className="wrap">
          <Link className="back" href={group ? `/dashboard?group=${encodeURIComponent(group.id)}` : "/dashboard"}>
            <BackIcon />
            Recent charges
          </Link>
          {charge || group ? (
            <div className="chg">
              {charge ? (
                <>
                  <span className="mic" aria-hidden="true">{charge.merchant.charAt(0).toUpperCase()}</span>
                  <span>
                    <b>{charge.merchant}, {charge.amount}</b>
                    <small>{charge.date}, from your linked card</small>
                  </span>
                </>
              ) : null}
              <span className={`gtag${group ? "" : " none"}`}>{group ? `Group: ${group.name}` : "No group"}</span>
            </div>
          ) : null}
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
                <div
                  className="vf"
                  style={{
                    aspectRatio:
                      phoneOrientation === "portrait" ? "3 / 4" : "4 / 3",
                  }}
                >
                  <video ref={videoRef} playsInline muted autoPlay />
                  {cameraOn && detectedWords.length > 0 && frameSize.width > 0 && (
                    <svg
                      aria-hidden="true"
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
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
                  <h2 id="p-h">
                    {isProcessing
                      ? "Working on it"
                      : processingStage === "error"
                        ? "Receipt reading stopped"
                        : "Preparing your receipt"}
                  </h2>
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
                  {processingStage === "error" ? (
                    <button className="btn lg" type="button" onClick={readReceipt}>
                      Try again
                    </button>
                  ) : (
                    <button className="btn lg" type="button" disabled>
                      Reading…
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
                      <div className="tot-out" aria-live="polite">{withDollar(displayedReceiptTotal)}</div>
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
                    <SaveReceiptButton
                      rows={receiptRows}
                      group={group}
                      listName={charge?.merchant ?? "Receipt"}
                      merchant={receiptMerchant}
                      onMerchantChange={setReceiptMerchant}
                      receiptTotals={receiptTotals}
                      displayedReceiptTotal={displayedReceiptTotal}
                    />
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

            </>
          )}
        </div>
      </main>
    </div>
  );
}

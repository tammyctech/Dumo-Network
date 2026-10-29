import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Bell,
  BellOff,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Smartphone,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";

const API_URL = (
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

type Notice = {
  kind: "success" | "error" | "info";
  message: string;
} | null;

interface SubscriptionStatus {
  enabled: boolean;
  device_count: number;
}

function supportsPushNotifications(): boolean {
  return (
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

function urlBase64ToUint8Array(
  base64String: string
): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat(
    (4 - (base64String.length % 4)) % 4
  );
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(rawData.length));

  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index);
  }

  return output;
}

function keysMatch(
  current: ArrayBuffer | null,
  expected: Uint8Array<ArrayBuffer>
): boolean {
  if (!current) return false;
  const currentBytes = new Uint8Array(current);
  return (
    currentBytes.length === expected.length &&
    currentBytes.every((value, index) => value === expected[index])
  );
}

async function createPushSubscription(
  registration: ServiceWorkerRegistration,
  applicationServerKey: Uint8Array<ArrayBuffer>
): Promise<PushSubscription> {
  const existing = await registration.pushManager.getSubscription();

  if (existing) {
    if (keysMatch(existing.options.applicationServerKey, applicationServerKey)) {
      return existing;
    }
    await existing.unsubscribe();
  }

  try {
    return await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !["NetworkError", "AbortError", "InvalidStateError"].includes(error.name)
    ) {
      throw error;
    }

    await registration.update();
    const refreshedRegistration = await navigator.serviceWorker.ready;
    const refreshed = await refreshedRegistration.pushManager.getSubscription();
    if (refreshed) await refreshed.unsubscribe();

    return refreshedRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  }
}

async function parseError(
  response: Response,
  fallback: string
): Promise<string> {
  try {
    const data = (await response.json()) as { detail?: unknown };
    return typeof data.detail === "string" ? data.detail : fallback;
  } catch {
    return fallback;
  }
}

function describePushSubscriptionError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Unable to enable notifications on this device.";
  }

  if (
    error.name === "NetworkError" ||
    error.name === "AbortError" ||
    error.message.toLowerCase().includes("networkerror")
  ) {
    return (
      "Your browser could not reach its push notification provider. " +
      "The Dumo service worker and notification key are valid, but your " +
      "network, VPN, Private DNS, ad blocker, or browser privacy mode may " +
      "be blocking Google, Mozilla, or Samsung push services. Try a different " +
      "network, such as mobile data, and retry."
    );
  }

  if (
    error.name === "NotAllowedError" ||
    error.name === "SecurityError"
  ) {
    return (
      "Notification permission is blocked. Allow notifications for Dumo " +
      "Network in your browser settings, then refresh this page."
    );
  }

  if (
    error.name === "InvalidAccessError" ||
    error.name === "InvalidStateError"
  ) {
    return (
      "This browser could not use the configured notification key. " +
      "Please contact the Dumo Network administrator."
    );
  }

  return error.message;
}

export default function EnableNotifications() {
  const { token } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCurrentDeviceEnabled, setIsCurrentDeviceEnabled] =
    useState(false);
  const [deviceCount, setDeviceCount] = useState(0);
  const [notice, setNotice] = useState<Notice>(null);

  const supported = supportsPushNotifications();
  const permission = supported
    ? Notification.permission
    : "unsupported";
  const configured = Boolean(VAPID_PUBLIC_KEY);

  const loadStatus = useCallback(async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/push/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(
          await parseError(
            response,
            "Unable to load notification settings."
          )
        );
      }

      const status = (await response.json()) as SubscriptionStatus;
      setDeviceCount(status.device_count);

      if (!supported || Notification.permission !== "granted") {
        setIsCurrentDeviceEnabled(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription =
        await registration.pushManager.getSubscription();
      setIsCurrentDeviceEnabled(Boolean(subscription));
    } catch (error) {
      setNotice({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to load notification settings.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [supported, token]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadStatus();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadStatus]);

  async function enableNotifications() {
    if (!token || isProcessing) return;

    setIsProcessing(true);
    setNotice(null);

    try {
      if (!supported) {
        throw new Error(
          "Push notifications are not supported on this device."
        );
      }
      if (!window.isSecureContext) {
        throw new Error("Notifications require HTTPS or localhost.");
      }
      if (!VAPID_PUBLIC_KEY) {
        throw new Error(
          "Push notifications are not configured. Contact an administrator."
        );
      }

      const result =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();

      if (result !== "granted") {
        throw new Error(
          result === "denied"
            ? "Notifications are blocked in your browser settings."
            : "Notification permission was not granted."
        );
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await createPushSubscription(
        registration,
        urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      );

      const data = subscription.toJSON();
      if (!data.endpoint || !data.keys?.p256dh || !data.keys.auth) {
        throw new Error(
          "The browser returned an incomplete push subscription."
        );
      }

      const response = await fetch(`${API_URL}/api/push/subscribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          endpoint: data.endpoint,
          keys: {
            p256dh: data.keys.p256dh,
            auth: data.keys.auth,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(
          await parseError(response, "Unable to register this device.")
        );
      }

      setIsCurrentDeviceEnabled(true);
      setNotice({
        kind: "success",
        message: "Notifications are enabled on this device.",
      });
      await loadStatus();
    } catch (error) {
      setNotice({
        kind: "error",
        message: describePushSubscriptionError(error),
      });
    } finally {
      setIsProcessing(false);
    }
  }

  async function disableNotifications() {
    if (!token || isProcessing || !supported) return;

    setIsProcessing(true);
    setNotice(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        await registration.pushManager.getSubscription();

      if (subscription) {
        const response = await fetch(`${API_URL}/api/push/unsubscribe`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });

        if (!response.ok) {
          throw new Error(
            await parseError(
              response,
              "Unable to remove this device from your account."
            )
          );
        }

        await subscription.unsubscribe();
      }

      setIsCurrentDeviceEnabled(false);
      setNotice({
        kind: "success",
        message: "Notifications are disabled on this device.",
      });
      await loadStatus();
    } catch (error) {
      setNotice({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to disable notifications.",
      });
    } finally {
      setIsProcessing(false);
    }
  }

  const noticeStyles =
    notice?.kind === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : notice?.kind === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : "border-blue-200 bg-blue-50 text-blue-800";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <Bell size={21} />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">
              Browser push notifications
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Receive polling-unit assignments, election updates, and
              important administrative announcements on this device.
            </p>
          </div>
        </div>

        <span
          className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
            isCurrentDeviceEnabled
              ? "bg-emerald-100 text-emerald-800"
              : "bg-slate-100 text-slate-600"
          }`}
        >
          {isLoading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : isCurrentDeviceEnabled ? (
            <CheckCircle2 size={14} />
          ) : (
            <BellOff size={14} />
          )}
          {isLoading
            ? "Checking"
            : isCurrentDeviceEnabled
              ? "Enabled"
              : "Disabled"}
        </span>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            This browser
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-800">
            {supported ? "Supported" : "Not supported"}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Permission
          </p>
          <p className="mt-1 text-sm font-semibold capitalize text-slate-800">
            {permission}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Smartphone size={13} /> Registered devices
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-800">
            {isLoading ? "—" : deviceCount}
          </p>
        </div>
      </div>

      {!configured && (
        <div className="mt-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <p>
            Push delivery is not configured for this deployment. Set the
            public VAPID key before enabling notifications.
          </p>
        </div>
      )}

      {notice && (
        <div
          role={notice.kind === "error" ? "alert" : "status"}
          className={`mt-4 flex gap-3 rounded-xl border p-4 text-sm ${noticeStyles}`}
        >
          {notice.kind === "success" ? (
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          ) : notice.kind === "error" ? (
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
          ) : null}
          <p>{notice.message}</p>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        {isCurrentDeviceEnabled ? (
          <button
            type="button"
            onClick={() => void disableNotifications()}
            disabled={isLoading || isProcessing}
            className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isProcessing ? (
              <Loader2 size={17} className="animate-spin" />
            ) : (
              <BellOff size={17} />
            )}
            Disable on this device
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void enableNotifications()}
            disabled={
              isLoading ||
              isProcessing ||
              !supported ||
              !configured ||
              permission === "denied"
            }
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isProcessing ? (
              <Loader2 size={17} className="animate-spin" />
            ) : (
              <Bell size={17} />
            )}
            Enable on this device
          </button>
        )}

        <button
          type="button"
          onClick={() => void loadStatus()}
          disabled={isLoading || isProcessing}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw
            size={17}
            className={isLoading ? "animate-spin" : ""}
          />
          Refresh status
        </button>
      </div>

      {permission === "denied" && (
        <p className="mt-4 text-sm text-slate-500">
          Permission is blocked. Allow notifications for this site in your
          browser settings, then refresh the status.
        </p>
      )}
    </section>
  );
}

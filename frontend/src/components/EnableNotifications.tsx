import { useState } from "react";
import { useAuth } from "../context/AuthContext";

const API_URL =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

// Convert the VAPID public key into the format required by PushManager.
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);

  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);

  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));

  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

export default function EnableNotifications() {
  const { token } = useAuth();

  const [status, setStatus] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);

  const enableNotifications = async () => {
    if (isProcessing) return;

    setIsProcessing(true);
    setStatus("");

    try {
      // =====================================
      // CHECK AUTHENTICATION
      // =====================================

      if (!token) {
        setStatus("Please log in to enable notifications.");
        return;
      }

      // =====================================
      // CHECK BROWSER SUPPORT
      // =====================================

      if (
        !("Notification" in window) ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      ) {
        setStatus(
          "Push notifications are not supported on this device."
        );
        return;
      }

      // =====================================
      // CHECK SECURE CONNECTION
      // =====================================

      if (!window.isSecureContext) {
        setStatus(
          "Notifications require HTTPS or localhost."
        );
        return;
      }

      // =====================================
      // CHECK VAPID CONFIGURATION
      // =====================================

      if (!VAPID_PUBLIC_KEY) {
        setStatus(
          "Push notifications are not configured. Contact the administrator."
        );
        return;
      }

      // =====================================
      // REQUEST NOTIFICATION PERMISSION
      // =====================================

      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();

      if (permission !== "granted") {
        setStatus(
          "Notification permission was not granted."
        );
        return;
      }

      // =====================================
      // WAIT FOR SERVICE WORKER
      // =====================================

      const registration =
        await navigator.serviceWorker.ready;

      if (!registration.active) {
        setStatus(
          "The DYN service worker is not active."
        );
        return;
      }

      // =====================================
      // CHECK EXISTING SUBSCRIPTION
      // =====================================

      let subscription =
        await registration.pushManager.getSubscription();

      // =====================================
      // CREATE SUBSCRIPTION IF NECESSARY
      // =====================================

      if (!subscription) {
        const applicationServerKey =
          urlBase64ToUint8Array(VAPID_PUBLIC_KEY);

        subscription =
          await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey,
          });
      }

      // =====================================
      // PREPARE SUBSCRIPTION DATA
      // =====================================

      const subscriptionData = subscription.toJSON();

      if (
        !subscriptionData.endpoint ||
        !subscriptionData.keys?.p256dh ||
        !subscriptionData.keys?.auth
      ) {
        throw new Error(
          "The browser returned an incomplete push subscription."
        );
      }

      // =====================================
      // REGISTER DEVICE WITH FASTAPI
      // =====================================

      const response = await fetch(
        `${API_URL}/api/push/subscribe`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            endpoint: subscriptionData.endpoint,
            keys: {
              p256dh: subscriptionData.keys.p256dh,
              auth: subscriptionData.keys.auth,
            },
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error(
            "Your session has expired. Please log in again."
          );
        }

        if (response.status === 409) {
          throw new Error(
            "This browser is already registered to another account."
          );
        }

        throw new Error(
          `Device registration failed (${response.status}).`
        );
      }

      // =====================================
      // SUCCESS
      // =====================================

      setIsEnabled(true);

      setStatus(
        "Notifications enabled! Your device is registered to receive DYN updates."
      );
    } catch (error) {
      console.error(
        "Push notification registration error:",
        error
      );

      setStatus(
        error instanceof Error
          ? error.message
          : "Unable to enable notifications. Please try again."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900">
        DYN Push Notifications
      </h3>

      <p className="mt-2 text-sm text-gray-600">
        Enable notifications to receive important election updates,
        polling unit assignments, and administrative announcements.
      </p>

      <button
        type="button"
        onClick={enableNotifications}
        disabled={isProcessing || isEnabled}
        className="mt-4 rounded-lg bg-emerald-800 px-5 py-3 font-medium text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isProcessing
          ? "Enabling Notifications..."
          : isEnabled
            ? "Notifications Enabled"
            : "Enable Notifications"}
      </button>

      {status && (
        <p role="status" className="mt-3 text-sm text-gray-700">
          {status}
        </p>
      )}
    </div>
  );
}

import { useEffect } from "react";

type ToastProps = {
  message: string;
  type?: "error" | "success" | "info";
  onClose: () => void;
  duration?: number;
};

/**
 * Simple toast notification component for displaying temporary messages.
 */
export function Toast({ message, type = "info", onClose, duration = 5000 }: ToastProps) {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const getIcon = () => {
    switch (type) {
      case "error":
        return "❌";
      case "success":
        return "✅";
      default:
        return "ℹ️";
    }
  };

  const getBackgroundColor = () => {
    switch (type) {
      case "error":
        return "#d32f2f";
      case "success":
        return "#2e7d32";
      default:
        return "#1976d2";
    }
  };

  return (
    <div 
      className="toast"
      style={{
        position: "fixed",
        bottom: "2rem",
        right: "2rem",
        backgroundColor: getBackgroundColor(),
        color: "#fff",
        padding: "1rem 1.5rem",
        borderRadius: "8px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        maxWidth: "400px",
        zIndex: 1000,
        animation: "slideIn 0.3s ease-out",
      }}
      role="alert"
      aria-live="assertive"
    >
      <span style={{fontSize: "1.25rem"}}>{getIcon()}</span>
      <div style={{flex: 1}}>
        <p style={{margin: 0, fontSize: "0.95rem", lineHeight: 1.4}}>{message}</p>
      </div>
      <button
        onClick={onClose}
        style={{
          background: "none",
          border: "none",
          color: "#fff",
          fontSize: "1.5rem",
          cursor: "pointer",
          padding: 0,
          lineHeight: 1,
          opacity: 0.8,
        }}
        aria-label="Close notification"
      >
        ×
      </button>
    </div>
  );
}


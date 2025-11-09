type LoadingOverlayProps = {
  message?: string;
};

export function LoadingOverlay({ message = 'Processing dataset...' }: LoadingOverlayProps) {
  return (
    <div className="loading-overlay">
      <div style={{ textAlign: 'center' }}>
        <div className="loading-spinner"></div>
        <p style={{ marginTop: '1rem', color: '#1976d2', fontWeight: 600 }}>
          {message}
        </p>
      </div>
    </div>
  );
}


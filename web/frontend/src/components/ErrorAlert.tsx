import { useMemo } from 'react';
import { FaExclamationTriangle, FaRedo } from 'react-icons/fa';

type ErrorAlertProps = {
  error: string;
  onRetry?: () => void;
  onDismiss?: () => void;
};

export function ErrorAlert({ error, onRetry, onDismiss }: ErrorAlertProps) {
  // * Parse error message to provide helpful context
  const errorDetails = useMemo(() => {
    if (error.includes('missing required columns')) {
      return {
        title: 'Invalid File Format',
        message: error,
        suggestions: [
          'Ensure your CSV matches the UNSW-NB15 format',
          'Download the template CSV and compare headers',
          'Check that all 46 required features are present'
        ]
      };
    }
    
    if (error.includes('Network Error') || error.includes('fetch')) {
      return {
        title: 'Connection Error',
        message: 'Unable to reach the server',
        suggestions: [
          'Check that the backend server is running',
          'Verify the API URL is correct',
          'Check your network connection'
        ]
      };
    }
    
    if (error.includes('timeout') || error.includes('timed out')) {
      return {
        title: 'Request Timeout',
        message: 'The server took too long to respond',
        suggestions: [
          'Try uploading a smaller dataset',
          'Check server resources and load',
          'Retry the request'
        ]
      };
    }
    
    return {
      title: 'Processing Error',
      message: error,
      suggestions: ['Please try again or contact support if the issue persists']
    };
  }, [error]);

  return (
    <div className="error-alert" role="alert">
      <div className="error-alert-header">
        <FaExclamationTriangle size={24} />
        <h4 className="error-alert-title">{errorDetails.title}</h4>
      </div>
      <p className="error-alert-message">{errorDetails.message}</p>
      {errorDetails.suggestions.length > 0 && (
        <details style={{ marginTop: '0.75rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#d32f2f' }}>
            Troubleshooting Steps
          </summary>
          <ul style={{ margin: '0.5rem 0 0 1.5rem', color: '#666' }}>
            {errorDetails.suggestions.map((suggestion, idx) => (
              <li key={idx}>{suggestion}</li>
            ))}
          </ul>
        </details>
      )}
      <div className="error-alert-actions">
        {onRetry && (
          <button className="error-retry-btn" onClick={onRetry}>
            <FaRedo /> Retry
          </button>
        )}
        {onDismiss && (
          <button 
            className="btn-clear-filters" 
            onClick={onDismiss}
            style={{ background: 'white', border: '1px solid #ccc' }}
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}


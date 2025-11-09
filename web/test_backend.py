"""
Simple test to verify backend data structures
"""
import sys
sys.path.insert(0, 'web/backend')

from app.services.prediction_service import PredictionService
from app.services.artifacts import ModelArtifacts
from app.config import settings
import pandas as pd

# Load artifacts
try:
    artifacts = ModelArtifacts(settings.model_path, settings.meta_path)
    print(f"✓ Artifacts loaded successfully")
    print(f"  - Pipeline: {type(artifacts.pipeline).__name__}")
    print(f"  - Positive label: {artifacts.positive_label}")
    print(f"  - Required features: {len(artifacts.required_features)}")
except Exception as e:
    print(f"✗ Failed to load artifacts: {e}")
    sys.exit(1)

# Create prediction service
service = PredictionService(artifacts)
print(f"✓ PredictionService created")

# Try to load a sample CSV if it exists
try:
    # Try to find UNSW test file
    test_file = "UNSW-NB15/CSV Files/UNSW-NB15_1.csv"
    df = pd.read_csv(test_file)
    print(f"✓ Loaded test CSV: {test_file} ({len(df)} rows)")
    
    # Convert to bytes
    file_bytes = df.to_csv(index=False).encode('utf-8')
    
    # Process
    response, enriched_df = service.process_upload(file_bytes, "test.csv")
    
    print(f"\n✓ Process completed successfully!")
    print(f"  - Result ID: {response.result_id}")
    print(f"  - Predictions: {len(response.predictions)}")
    print(f"  - Columns: {len(response.columns)}")
    print(f"  - Validation:")
    print(f"    - Row count: {response.validation.row_count}")
    print(f"    - Downsampled: {response.validation.downsampled}")
    print(f"  - Charts:")
    print(f"    - Label breakdown: {response.charts.label_breakdown.counts}")
    print(f"    - Anomalies over time: {len(response.charts.anomalies_over_time)}")
    print(f"    - Top ports: {len(response.charts.top_destination_ports)}")
    
    if response.predictions:
        print(f"\n  Sample prediction:")
        sample = response.predictions[0]
        print(f"    - Row index: {sample.row_index}")
        print(f"    - Prediction: {sample.prediction}")
        print(f"    - Score: {sample.score}")
        print(f"    - Data keys: {list(sample.data.keys())[:5]}...")
        
except FileNotFoundError:
    print(f"✗ Test file not found: {test_file}")
except Exception as e:
    print(f"✗ Error during processing: {e}")
    import traceback
    traceback.print_exc()

# Malware Detection Dataset

## Overview
This dataset is designed for **binary classification**: detecting whether a Windows executable file (Portable Executable, PE) is **malware** or **benign**.  
It provides **pre-extracted static features** instead of raw binary files, making it safe and convenient for teaching machine learning and data visualization.

---

## Data Description
- **Features:** Numeric values representing properties of PE files, such as:
  - File size and number of sections  
  - Entropy of code/data sections (randomness measure)  
  - Header metadata (imports, exports, etc.)  
  - Byte histograms or opcode frequency counts  
- **Label (Target):**
  - `0` → Benign (normal software)  
  - `1` → Malware (malicious software)  

---

## Learning Objectives
This dataset allows students to:
1. **Visualize distributions** of malware vs. benign files (e.g., histograms, boxplots, scatter plots).  
2. **Explore correlations** between different features (heatmaps, pair plots).  
3. **Identify key features** that separate malware from benign files.  
4. **Build models** (e.g., decision trees, logistic regression, random forests) to classify executables.  

---

## Suggested Visualizations
- **Class balance:** Bar chart of benign vs. malware samples.  
- **File size distribution:** Compare malware vs. benign with histograms.  
- **Entropy values:** Boxplot to show differences in randomness.  
- **Feature correlations:** Heatmap of numeric features.  
- **Dimensionality reduction (PCA):** Scatter plot to visualize separation between classes.  

---

## Notes
- The dataset is safe: it contains **only extracted numeric features**, not actual executable files.  
- Students are encouraged to try both **feature visualization** and **model building** to understand how malware differs from benign software.  

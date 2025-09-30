# Processed Network Intrusion Dataset (Simplified Version)

This dataset is a simplified version of a well-known network intrusion dataset. It has been preprocessed and cleaned to make it more suitable for classroom use and small-scale experiments. The dataset represents network traffic connections, with both normal and malicious activities.

---

## Dataset Details

- **Format:** CSV  
- **Records:** Includes both normal and attack samples.  
- **Preprocessing steps applied:**  
  1. Selected 8 core features (irrelevant or weakly related features removed).  
  2. Converted to CSV for easy use in machine learning workflows.  
  3. Introduced random missing values (about 20 rows) to simulate real-world data issues.  

---

## Features (8 total)

1. **duration** – Connection length (in seconds).  
2. **protocol_type** – Type of protocol (e.g., tcp, udp, icmp).  
3. **service** – Target service (e.g., http, telnet, ftp).  
4. **flag** – Connection status flag (e.g., SF, REJ, S0).  
5. **src_bytes** – Bytes sent from the source host.  
6. **dst_bytes** – Bytes sent from the destination host.  
7. **count** – Number of connections to the same host in the past 2 seconds.  
8. **srv_count** – Number of connections to the same service in the past 2 seconds.  

---

## Labels

The dataset contains **normal traffic** and various types of **attacks**, grouped into four major categories:

1. **DoS (Denial of Service)** – Attacks that flood resources to make a service unavailable.  
   - Examples: `neptune`, `smurf`, `back`, `teardrop`, `pod`  

2. **Probe** – Attacks that scan or gather information about the target.  
   - Examples: `satan`, `ipsweep`, `nmap`, `portsweep`  

3. **R2L (Remote to Local)** – Attempts to gain unauthorized access to a local system from a remote machine.  
   - Examples: `guess_passwd`, `ftp_write`, `imap`, `phf`, `warezclient`, `warezmaster`  

4. **U2R (User to Root)** – Attempts to gain root privileges from a normal user account.  
   - Examples: `buffer_overflow`, `loadmodule`, `rootkit`, `perl`  

---

## How to Use

This dataset can be applied to different tasks such as:  
- **Binary classification:** Normal vs. Attack.  
- **Multiclass classification:** Normal + four attack categories.  
- **Anomaly detection:** Detecting abnormal patterns without prior knowledge of attack types.  

---

## Notes

- The dataset size is relatively large and may slow down model training.  
- **Recommendation for students:**  
  - You may reduce the dataset size by random sampling or downsampling, but ensure that:  
    1. All categories (normal, DoS, Probe, R2L, U2R) are still included.  
    2. Your model is able to fit the training data properly and shows good performance on evaluation.  

---

## Suggested Exercises

1. **Classification Models:** Train models such as logistic regression, random forest, or neural networks for binary or multiclass classification.  
2. **Handling Missing Data:** Apply imputation techniques (mean, median, KNN, etc.) to deal with the simulated missing values.  
3. **Feature Importance Analysis:** Investigate which features contribute most to classification.  
4. **Imbalanced Data Handling:** Explore undersampling, oversampling, or SMOTE to improve recognition of rare attack types.  

Note: You don’t need to fully master these methods at this stage—just be aware of their names. 
If you are interested, here are some beginner-friendly resources you can explore:  

- [Imbalance.jl GitHub (great introduction with examples for these three methods)](https://juliaai.github.io/Imbalance.jl/dev/algorithms/oversampling_algorithms/)  
- [Oversampling and undersampling in data analysis – Wikipedia](https://en.wikipedia.org/wiki/Oversampling_and_undersampling_in_data_analysis)  
- [SMOTE Oversampling for Imbalanced Classification – Machine Learning Mastery](https://machinelearningmastery.com/smote-oversampling-for-imbalanced-classification)  

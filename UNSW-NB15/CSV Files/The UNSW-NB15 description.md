
1
The UNSW-NB15 data set description:
The raw network packets of the UNSW-NB 15 data set is created by the IXIA PerfectStorm tool
in the Cyber Range Lab, UNSW Canberra for generating a hybrid of real modern normal
activities and synthetic contemporary attack behaviours. Tcpdump tool is utilised to capture
100 GB of the raw traffic (e.g., Pcap files). This data set has nine families of attacks,
namely, Fuzzers, Analysis, Backdoors, DoS, Exploits, Generic, Reconnaissance,
Shellcode and Worms. The Argus, Bro-IDS tools are utilised and twelve algorithms are
developed to generate totally 49 features with the class label. These features are described in
UNSW-NB15_freatures.csv file. The total number of records is two millions and 540,044
which are stored in the four CSV files, namely, UNSW-NB15_1.csv, UNSW-
NB15_1.csv, UNSW-NB15_1.csv and UNSW-NB15_1.csv. The ground truth table is named
UNSW-NB15_GT.CSV and the list of event file is called UNSW-NB15_LIST_EVENTS.
A partition from this data set is configured as a training set and testing set,
namely, UNSW_NB15_training-set.csv and UNSW_NB15_testing-set respectively. The
number of records in the training set is 175,341 records and the testing set is 82,332 records
from different the types of attack and normal.
For more information or requested the Pcap files of the data set, please contact the authors:
1. Nour Moustafa: e-mail (nour.moustafa@unsw.edu.au, nour.moustafa@ieee.org)
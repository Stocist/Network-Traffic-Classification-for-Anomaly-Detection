# Service Bar Chart Update - Removing Redundancy

## 🎯 Problem Identified

The "Top targeted services" bar chart was showing **port numbers** (53, 80, 111, etc.), which created redundancy with the Port × Attack heatmap that also shows ports.

### Before:
- 🗺️ **Heatmap**: Shows ports (53, 80, 111, etc.) × attack types
- 📊 **Bar chart**: Shows ports (53, 80, 111, etc.) × attack count
- ❌ **Problem**: Two visualizations showing the same dimension (ports)

---

## ✅ Solution Implemented

Changed the bar chart to show **service names** instead of port numbers, providing **complementary information**.

### After:
- 🗺️ **Heatmap**: Shows **port numbers** (53, 80, 111) × attack types → Technical view
- 📊 **Bar chart**: Shows **service names** (dns, http, ftp, smtp) × attack count → Business view
- ✅ **Result**: Two different perspectives on the same data

---

## 📊 What Changed

### Backend Changes:

1. **Renamed method**: `_top_ports()` → `_top_services()`
   - Now explicitly looks for `service`, `app_protocol`, or `protocol` columns
   - Prioritizes service names over port numbers
   - Filters out invalid services (`-`, `nan`, `None`, empty strings)

2. **Updated `_build_charts()`**:
   - Calls `_top_services()` instead of `_top_ports()`
   - Returns service names in `top_destination_ports` field (field name unchanged for API compatibility)

### Expected Bar Chart Output:

Instead of:
```
Port 53:    502 attacks
Port 111:    48 attacks  
Port 520:    35 attacks
Port 514:    28 attacks
Port 80:      1 attack
```

You'll now see:
```
dns:        XXX attacks  (Domain Name System)
http:       XXX attacks  (Web traffic)
ftp-data:   XXX attacks  (File transfer data)
smtp:       XXX attacks  (Email)
ftp:        XXX attacks  (File transfer control)
```

---

## 🎓 Benefits for Demo

### 1. **Removes Redundancy**
- Each visualization now shows **unique information**
- No more confusion about why two charts show the same ports

### 2. **Business-Friendly View**
- Service names (dns, http, smtp) are more **understandable** to non-technical stakeholders
- Port numbers (53, 80, 25) are better for technical analysis

### 3. **Complementary Insights**
- **Heatmap**: "Which ports are targeted by which attack types?" (detailed technical)
- **Bar chart**: "Which services are most attacked overall?" (high-level business)

### 4. **Better Storytelling**
During demo, you can say:
> *"The heatmap shows that port 53 is heavily targeted by Generic attacks. Looking at our service chart, we can see that DNS service is the most attacked, which makes sense as DNS is critical infrastructure and a common attack vector for reconnaissance and DDoS amplification."*

---

## 🔄 What to Expect

After restarting the backend, the bar chart will show:
- ✅ Service names (dns, http, ftp, smtp, etc.) instead of port numbers
- ✅ Filtered to only attacks with valid taxonomy (consistent with heatmap)
- ✅ Excludes "-" (no service detected) and invalid entries
- ✅ Top 10 most attacked services

---

## 📝 Technical Details

**File changed**: `web/backend/app/services/prediction_service.py`

**Methods:**
- Added: `_top_services()` (lines 252-304)
- Modified: `_build_charts()` to call `_top_services()` (line 220)

**Column lookup priority**:
1. `service` (UNSW-NB15 standard)
2. `app_protocol` (alternative)
3. `protocol` (fallback)

**Filtering**:
- Removes: `-`, `nan`, `None`, empty strings, `0`
- Only counts: Valid attack taxonomy (Generic, Exploits, etc.)
- Consistent with: Attack taxonomy chart and port heatmap


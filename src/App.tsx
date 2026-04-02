/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Send, Bot, Loader2, Trash2, Info, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';

// ΑΡΧΙΚΟΠΟΙΗΣΗ ΤΟΥ GEMINI API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const BOT_INSTRUCTIONS = `
Είσαι ο επίσημος ψηφιακός βοηθός εξυπηρέτησης για τα μέλη του "Προμηθευτικού & Καταναλωτικού Συνεταιρισμού Αστυνομικών Αττικής".
Ο ρόλος σου είναι να καθοδηγείς τα μέλη με ευγένεια, αμεσότητα και απόλυτη ακρίβεια σχετικά με τις διαδικασίες αιτήσεων για σταθερή/κινητή τηλεφωνία, τηλεόραση, και ασφαλιστικά προγράμματα. Στο καλωσορισμα μην τα αναφεριες μιλα λακωνικα μονο αμα σου ζητησουν πληροφοριες ανεφερε ποιος εισαι, να μιλας φιλικα σαν να εισαι ανθρωπος το ονομα σου ειναι  αστυνομος σαινησ αλλα μην αναφερει το αστυνομος παρα μονο αν σε ζοριζουν και δεν σε σεβονται ή σου μιλανε αποτομα 

ΒΑΣΙΚΟΙ ΚΑΝΟΝΕΣ:
1. Όταν ξεκινά το chat, χαιρέτησε ευγενικά.
2. ΜΗΝ γράφεις τεράστια "σεντόνια" κειμένου. Χώρισε τα μηνύματά σου.
3. Κάνε ερωτήσεις ανατροφοδότησης στο τέλος (π.χ. "Θέλετε να σας στείλω τα δικαιολογητικά;").
4. Βασίσου ΑΥΣΤΗΡΑ στις παρεχόμενες πληροφορίες. 

ΟΔΗΓΙΕΣ ΜΟΡΦΟΠΟΙΗΣΗΣ (MARKDOWN):
- Χρησιμοποίησε Έντονη Γραφή (Bold) για Τιμές (π.χ. **100€**), Τηλέφωνα (π.χ. **210 5245210**) και ονόματα παρόχων.
- IBAN & Κωδικοί: Όταν γράφεις ένα IBAN, να τον βάζεις ΠΑΝΤΑ μέσα σε backticks ( \` ), π.χ. \`GR5801720500005050099524664\`.
- Χρησιμοποίησε Emojis (π.χ. 💶, ☎️, 📍, ⚡).

--- 📦 ΠΛΗΡΟΦΟΡΙΕΣ ΠΑΚΕΤΩΝ ---

| 📱 Πάροχος | 💰 Κόστος | 🎁 Παροχές |
| :--- | :--- | :--- |
| **Vodafone CU** | **100€ / έτος** | Απεριόριστα Λεπτά, SMS & Data (Προπληρωμένο) |
| **Nova Q** | **100€ / έτος** | Απεριόριστα Λεπτά, SMS & Data (Προπληρωμένο) |
| **Nova Σταθερό** | **17,90€ / μήνα** | Internet & Σταθερή Τηλεφωνία |
| **Nova EON TV** | **20,90€ / μήνα** | EON TV + Cosmote TV (Full Pack) |
| **Enerwave** | **0,0999€ / kWh** | Ρεύμα χωρίς πάγιο ή δεσμεύσεις |

--- 📝 ΟΔΗΓΙΕΣ ΣΥΜΠΛΗΡΩΣΗΣ ΕΓΓΡΑΦΩΝ (ΑΠΟ ΤΑ ΠΑΡΑΔΕΙΓΜΑΤΑ) ---
Προσοχη για τον χρηστη υποβάλει αιτηση ο κάτοχος του αριθμου αλλιως απορριπτεται 
Αν ο χρήστης ρωτήσει πώς συμπληρώνονται οι φόρμες, δώσε τις εξής οδηγίες:
# [BOT_INSTRUCTIONS_TELECOM_FORMS_GR]
# Version: 1.0
# Scope: Guidance for completing Greek Telecom Forms (NOVA & Vodafone)
# Context: Identification (Prepaid), GDPR/Privacy, Portability Requests.

## 0. GENERAL SYSTEM RULES (CRITICAL)
- IDENTITY: You are a specialized assistant helping users correctly fill out official telecommunication forms in Greece.
- CONTEXT OF EXAMPLES: All provided image templates contain FICTIONAL DATA (e.g., Name: Anastasia Antoniadou, ID: A0000000, AFM: 0010000000). You MUST explicitly warn the user NEVER to copy this fictional data. They must use their actual, legal details.
- LEGALITY: Remind users that forms based on Law 1599/1986 (Υπεύθυνη Δήλωση) carry legal and penal consequences for false information. All forms require a real date and a PHYSICAL, handwritten signature.

---

## 1. FORM TYPE: NOVA - Υπεύθυνη Δήλωση Καρτοκινητού
**Objective:** Mandatory identification of a prepaid SIM card.
**Fields the user MUST pay attention to:**
*   **Personal Info:** Must exactly match the official ID/Passport.
*   **Phone Number:** Must be the correct 10-digit number.
*   **AFM (Tax ID):** Mandatory field.
*   **[CRITICAL WARNING] SIM Limit:** The text "διατηρώ συνολικά [ ] συνδέσεις..." is usually blank. The user MUST write the number of prepaid SIMs they own. The legal limit is 20 across all networks.
*   **Services / GDPR:**
    *   *Directory Listing:* Recommend NO (Όχι) for privacy.
    *   *112 Emergency:* Recommend YES (Ναι). If directory listing is NO, checking YES here ensures rescue services can identify the caller.
    *   *Marketing (Article 11):* NO means blocking promo calls.
    *   *NOVA Promos (SMS/Email):* User preference (YES/NO).

---

## 2. FORM TYPE: VODAFONE - Υπεύθυνη Δήλωση Καρτοκινητού
**Objective:** Mandatory identification of a Vodafone prepaid SIM.
**Fields the user MUST pay attention to:**
*   **AFM Placement:** Located outside the main box (top left).
*   **SIM Data:** Requires BOTH the 10-digit phone number AND the long SIM Serial Number (ICCID starting with 8930...).
*   **[CRITICAL WARNING] SIM Limit:** The lines detailing the number of active SIMs are left blank in templates. The user MUST fill in the actual number they own (Legal limit: 20).
*   **112 Emergency:** Must ensure they select "ΕΠΙΘΥΜΩ" (I desire) to share data with 112, even if they choose not to be in the public directory.
*   **Marketing/GDPR:** This form requires explicit consent ("Συναινώ" / "Δεν Συναινώ") for every communication channel (SMS, Call, Email). User must select based on preference. To block all ads, they must select "Δεν Συναινώ" everywhere.

---

## 3. FORM TYPE: VODAFONE - Χρήση Προσωπικών Δεδομένων (GDPR)
**Objective:** Detailed privacy, directory, and marketing settings for Contract or Prepaid users.
**Fields the user MUST pay attention to:**
*   **Entity Type:** Must correctly check "ΦΥΣΙΚΟ ΠΡΟΣΩΠΟ" (Individual) vs "ΝΟΜΙΚΟ ΠΡΟΣΩΠΟ" (Company).
*   **ICCID:** Mandatory SIM serial number input.
*   **[CRITICAL WARNING - TEMPLATE TRAP] 112 Emergency:** The template shows a checkmark on "Δεν Επιθυμώ" for 112. The bot MUST instruct the user to ignore the template and check **"Επιθυμώ"** for safety and rescue purposes.
*   **Marketing (Bottom Section):** To completely block call centers, check "Επιθυμώ να μη δέχομαι κλήσεις από κανέναν".

---

## 4. FORM TYPE: NOVA - Αίτηση Φορητότητας (Portability)
**Objective:** Moving an existing number from another provider (Donor) to NOVA.
**Fields the user MUST pay attention to:**
*   **Absolute Data Match:** The Name, ID, and AFM MUST exactly match the records held by the OLD provider. If there is a mismatch, the portability will fail.
*   **Donor Details:** Must provide the old SIM's ICCID (8930...) and select ONLY ONE Donor Provider (e.g., Cosmote OR Vodafone, not both).
*   **[CRITICAL WARNING] Waiver of Rights:** The checkbox **[+] Άμεση Ενεργοποίηση (Immediate Activation)**. The bot must explain: 
    *   *If checked:* Porting happens in 1-3 days, but the user LOSES the 14-day right of withdrawal.
    *   *If unchecked:* Porting is delayed by 14 days, allowing the user to cancel or accept counter-offers.

---

## 5. FORM TYPE: VODAFONE - Αίτημα Ενεργοποίησης Φορητότητας
**Objective:** Confirmation of portability timing and waiver of the 14-day withdrawal right.
**Fields the user MUST pay attention to:**
*   **Two Phone Numbers:**
    *   *Number 1:* The number being ported.
    *   *Number 2:* A different contact number (for communication during the transition).
*   **[CRITICAL WARNING] The 14-Day Rule (Section 2):**
    *   **"ΑΜΕΣΑ" (Immediately):** Bypasses the 14-day wait. The porting happens fast, but once activated, the user CANNOT cancel the contract.
    *   **"ΜΕΤΑ ΑΠΟ 14 ΗΜΕΡΕΣ" (After 14 days):** The process is frozen for two weeks. The user can cancel without penalty during this time. The bot must ensure the user understands this legal difference.

---
## EOF
--- 💳 ΤΡΑΠΕΖΙΚΟΙ ΛΟΓΑΡΙΑΣΜΟΙ SOUTH ATTICA TELECOMMUNICATIONS ---

Για την κατάθεση των **100€** (για τα ετήσια πακέτα κινητής):

οταν δίνεις IBAN ή όνομα δικαιουχου κάνε το σε μορφή να μπορει να το αντιγραψει ευκολα στο κινητο
- ** Όνομα δικαιούχου: \`SOUTH ATTICA TELECOMMUNICATIONS\`
- **Τράπεζα Πειραιώς:** \`GR1601720500005050085444333\`
- **Eurobank:** \`GR2102602070000920201222444\`
- **Αιτιολογία:** Ονοματεπώνυμο & Αριθμός Κινητού.

--- 📧 ΕΠΙΚΟΙΝΩΝΙΑ ---
Μετά τη συμπλήρωση, τα δικαιολογητικά αποστέλλονται στο: **info@synetelas.gr**
Ο ΡΟΛΟΣ ΣΟΥ:
Είσαι ένας ευγενικός, ακριβής και εξυπηρετικός ψηφιακός βοηθός για τα μέλη του «Προμηθευτικού & Καταναλωτικού Συνεταιρισμού Αστυνομικών Αττικής» (ΠΚΣΑΑ). Βοηθάς τα μέλη να κατανοήσουν τις παροχές τους σχετικά με την Ομαδική Ασφάλιση Υγείας της INTERAMERICAN και την εκπτωτική προσφορά της ANYTIME.

ΒΑΣΙΚΟΙ ΚΑΝΟΝΕΣ ΑΠΑΝΤΗΣΕΩΝ:

Όταν σε ρωτούν για επείγοντα ιατρικά περιστατικά, δίνε πάντα ΠΡΩΤΟ το τηλέφωνο 1010.

Να διαχωρίζεις ξεκάθαρα την προσφορά Οχημάτων/Κατοικίας της Anytime από το Ομαδικό πρόγραμμα Υγείας της Interamerican.

Όταν μιλάς για αποζημιώσεις νοσηλείας, να υπενθυμίζεις ότι υπάρχει ετήσιο εκπιπτόμενο (απαλλασσόμενο) ποσό 500€ ανά άτομο.

Να αναφέρεις ότι οι πληροφορίες που δίνεις είναι ενημερωτικές και το τελικό συμβόλαιο είναι αυτό που καθορίζει νομικά την κάλυψη.

📚 ΒΑΣΗ ΔΕΔΟΜΕΝΩΝ (KNOWLEDGE BASE)

ΕΝΟΤΗΤΑ 1: ΕΠΕΙΓΟΝΤΑ ΤΗΛΕΦΩΝΑ & ΕΠΙΚΟΙΝΩΝΙΑ
Γραμμή Υγείας (Επείγοντα, Ασθενοφόρα, Συμβουλές): 1010 (24 ώρες/365 μέρες).

Αν ο χρήστης καλεί από το εξωτερικό: +30 210 946 1999.

Αν υπάρχει βλάβη στο σταθερό 1010: +30 6932 237000.

Τηλεφωνική Γραμμή Υγείας AFFIDEA (Για ραντεβού & διαγνωστικά): 216-0000013.

ΕΝΟΤΗΤΑ 2: ΕΚΠΤΩΣΗ ΟΧΗΜΑΤΩΝ & ΚΑΤΟΙΚΙΑΣ (ANYTIME)
Δικαιούχοι: Μέλη του ΠΚΣΑΑ, στελέχη ΕΛ.ΑΣ. και Σωμάτων Ασφαλείας (καθώς και συνταξιούχοι/συγγενείς).

Προσφορά: Επιπλέον 5% έκπτωση σε ασφάλιση οχημάτων, δικύκλων και κατοικίας.

Πώς ενεργοποιείται: Μέσω του anytime.gr βάζοντας τον κωδικό 1001065000000018 ή τηλεφωνικά στα 210.9460.000 & 80111.30000.

Υπεύθυνος Συνεργάτης: Ιωάννης Φιλιππίδης (Τηλ: 6932.313051, Email: g_filippidis@hotmail.com).

ΕΝΟΤΗΤΑ 3: ΟΜΑΔΙΚΟ ΑΣΦΑΛΙΣΤΗΡΙΟ ΥΓΕΙΑΣ (ΓΕΝΙΚΑ)
Αριθμός Ασφαλιστηρίου: 2002937 (Έναρξη ισχύος αλλαγής: 01/08/2024).

Μηνιαίο Κόστος (Ασφάλιστρα):

Κυρίως ασφαλιζόμενος: 47,17 €

Σύζυγος: 47,95 €

Κάθε παιδί: 40,95 €

Όριο Ευθύνης (Νοσοκομειακή περίθαλψη): Έως 50.000 € ανά έτος, ανά άτομο.

Απαλλασσόμενο Ποσό: Τα πρώτα 500 € κάθε έτους ανά άτομο (για νοσηλείες) αφαιρούνται (τα πληρώνει ο ασφαλισμένος).

Θέση Νοσηλείας: Γ' Θέση (3κλινο) εντός Ελλάδας. Όριο 600€/ημέρα για ΜΕΘ ή εξωτερικό.

Ασφάλεια Ζωής: 5.000 €. Ομαδικό Ατύχημα: Έως 6.000.000 €.

ΕΝΟΤΗΤΑ 4: ΚΑΛΥΨΗ ΝΟΣΗΛΕΙΑΣ (ΕΣΩΤΕΡΙΚΟΙ ΑΣΘΕΝΕΙΣ)
Αθηναϊκή Κλινική: 100% απευθείας κάλυψη.

Ειδικά Συμβεβλημένα (Ευρωκλινική, Ιατρικό Κέντρο, Mediterraneo κ.λπ.):

Χωρίς χρήση άλλου ταμείου (πχ ΕΟΠΥΥ): Κάλυψη 85%.

Με χρήση άλλου ταμείου (αν καλύψει το 15%): Κάλυψη 100% της διαφοράς.

Σημείωση: Για νοσηλεία σε ανώτερη θέση (πχ μονόκλινο), η συμμετοχή της Εταιρίας μειώνεται κατά 10%.

ΕΝΟΤΗΤΑ 5: ΕΞΩΝΟΣΟΚΟΜΕΙΑΚΗ ΠΕΡΙΘΑΛΨΗ (ΕΞΕΤΑΣΕΙΣ & ΓΙΑΤΡΟΙ)
Αθηναϊκή Κλινική & Πολυϊατρεία MEDIFIRST: Διαγνωστικές εξετάσεις έως 1.500€/έτος. Ιατρικές επισκέψεις χωρίς όριο με συμμετοχή 10€ / επίσκεψη.

Ευρωκλινική Παίδων: Εξετάσεις έως 400€/έτος. Επισκέψεις με συμμετοχή 10€ / επίσκεψη.

AFFIDEA (ΜΟΝΟ ΕΚΤΟΣ ΑΤΤΙΚΗΣ): Εξετάσεις έως 1.500€/έτος. Επισκέψεις με συμμετοχή 10€ / επίσκεψη. (Προσοχή: Η κάλυψη Affidea δεν ισχύει εντός Αττικής).

Εκτός δικτύων / Εξωτερικό: Απολογιστικά (με προσκόμιση αποδείξεων). Κάλυψη 85% μετά την αφαίρεση του απαλλασσόμενου ποσού.

ΕΝΟΤΗΤΑ 6: ΕΠΙΔΟΜΑΤΑ
Επίδομα Μητρότητας: Φυσιολογικός τοκετός 650€, Καισαρική 650€, Αποβολή 200€. (Προϋπόθεση: να έχουν περάσει 10 μήνες ασφάλισης).

Νοσοκομειακό Επίδομα (Αν δεν ζητηθεί αποζημίωση εξόδων): 60€ / ημέρα (έως 90 ημέρες).

Χειρουργικό Επίδομα (Αν δεν ζητηθεί αποζημίωση εξόδων): Έως 3.000€ ανάλογα τη σοβαρότητα.

ΕΝΟΤΗΤΑ 7: ΔΙΑΔΙΚΑΣΙΑ ΑΠΟΖΗΜΙΩΣΕΩΝ & ΔΙΚΑΙΟΛΟΓΗΤΙΚΑ
Συμφέρει τον ασφαλισμένο να κάνει ΠΡΩΤΑ χρήση του κύριου ταμείου του (π.χ. ΕΟΠΥΥ).

Απαιτούνται πρωτότυπα παραστατικά (αποδείξεις, τιμολόγια, ιατρικές γνωματεύσεις, εξιτήριο).

Αν έχουν κατατεθεί στον κύριο φορέα, απαιτείται επικυρωμένο αντίγραφο και η απόφαση πληρωμής του φορέα.

💬 ΠΑΡΑΔΕΙΓΜΑΤΑ ΕΡΩΤΗΣΕΩΝ-ΑΠΑΝΤΗΣΕΩΝ ΓΙΑ ΕΚΠΑΙΔΕΥΣΗ (Few-Shot Prompting)
User: Έπαθα ατύχημα και χρειάζομαι επειγόντως γιατρό / ασθενοφόρο. Τι κάνω;
AI: Καλέστε αμέσως τη Γραμμή Υγείας της Interamerican στο 1010. Η γραμμή λειτουργεί 24 ώρες το 24ωρο, 365 μέρες τον χρόνο. Θα σας καθοδηγήσουν και, αν χρειαστεί, θα στείλουν ασθενοφόρο ή άλλο μέσο για την υγειονομική σας μεταφορά. Αν βρίσκεστε στο εξωτερικό, καλέστε το +30 210 946 1999.

User: Θέλω να ασφαλίσω το αυτοκίνητό μου. Υπάρχει κάποια έκπτωση;
AI: Βεβαίως! Ως μέλος του ΠΚΣΑΑ έχετε επιπλέον έκπτωση 5% στο ήδη προνομιακό τιμολόγιο της Anytime για ασφάλιση οχημάτων, δικύκλων, αλλά και κατοικίας. Μπορείτε να ασφαλιστείτε μπαίνοντας στο anytime.gr και βάζοντας τον εκπτωτικό κωδικό 1001065000000018, ή τηλεφωνώντας στο 210.9460.000.

User: Πόσο κοστίζει το ομαδικό πρόγραμμα υγείας κάθε μήνα;
AI: Το μηνιαίο μικτό κόστος του Ομαδικού Ασφαλιστηρίου Υγείας διαμορφώνεται ως εξής:

Για τον κυρίως ασφαλιζόμενο: 47,17 €

Για τον/την σύζυγο: 47,95 €

Για κάθε παιδί: 40,95 €

User: Αν κάνω εισαγωγή στο Ιατρικό Κέντρο, πόσα θα πληρώσω;
AI: Το Ιατρικό Κέντρο Αθηνών (και Περιστερίου) ανήκει στα Ειδικά Συμβεβλημένα Ιδρύματα. Η κάλυψή σας έχει ως εξής:

Αν δεν κάνετε χρήση του ταμείου σας (π.χ. ΕΟΠΥΥ), η Interamerican καλύπτει το 85% και εσείς το 15%.

Αν κάνετε χρήση του ταμείου σας και αυτό καλύψει τουλάχιστον το 15% των εξόδων, τότε η Interamerican θα καλύψει το 100% της διαφοράς (δεν θα πληρώσετε τίποτα).
Προσοχή: Μην ξεχνάτε ότι ισχύει το ετήσιο απαλλασσόμενο ποσό των 500€, το οποίο αφαιρείται από την πρώτη νοσηλεία κάθε έτους.

User: Θέλω να πάω στον γιατρό για εξετάσεις. Τι ισχύει με την Affidea;
AI: Η κάλυψη μέσω του δικτύου AFFIDEA ισχύει αποκλειστικά και μόνο ΕΚΤΟΣ Αττικής.
Αν βρίσκεστε εκτός Αττικής, μπορείτε να κάνετε διαγνωστικές εξετάσεις (με όριο έως 1.500€ ετησίως) και να επισκεφθείτε ιατρούς του δικτύου καταβάλλοντας μόνο 10€ συμμετοχή ανά επίσκεψη. Για να κλείσετε ραντεβού ή για πληροφορίες, καλέστε τη Γραμμή Υγείας Affidea στο 216-0000013. Αν βρίσκεστε εντός Αττικής, μπορείτε να χρησιμοποιήσετε την Αθηναϊκή Κλινική ή τα Πολυϊατρεία MEDIFIRST με αντίστοιχους όρους.

User: Η γυναίκα μου θα γεννήσει. Δικαιούμαστε κάποιο ποσό;
AI: Ναι, το πρόγραμμα προσφέρει Επίδομα Μητρότητας, εφόσον έχουν περάσει 10 μήνες από την ημερομηνία ασφάλισης της γυναίκας. Το ποσό ανέρχεται σε 650€ για φυσιολογικό τοκετό και 650€ για καισαρική τομή. Σε περίπτωση αποβολής, το ποσό είναι 200€.
`;

// QUICK REPLIES
const QUICK_REPLIES: Record<string, string[]> = {
  "Αρχική Σελίδα": ["Κινητή", "Σταθερή Τηλεφωνία", "EON TV", "Υγεία"],
  "Επιλογή Κινητής": ["Ποια είναι η διαφορά Vodafone με Nova;", "Πόσο κοστίζει το ετήσιο πακέτο;"],
  "Vodafone CU (100€)": ["Τι δικαιολογητικά χρειάζομαι;", "Σε ποιο IBAN πρέπει να βάλω τα χρήματα;", "Είναι για φορητότητα ή νέο αριθμό;"],
  "NOVA Q (100€)": ["Τι δικαιολογητικά χρειάζομαι;", "Πόσα GB μου δίνει η Nova Q;", "Σε ποιο email στέλνω τα χαρτιά;"],
  "Σταθερή & Internet NOVA": ["Ποια είναι η τιμή του παγίου;", "Χρειάζεται να έχω ήδη γραμμή;", "Τι γίνεται αν είμαι εκτός σχεδίου;"],
  "Nova EON TV": ["Τι κανάλια περιλαμβάνει;", "Χρειάζεται πιάτο ή είναι μέσω Internet;"],

  "Υγεία & Περίθαλψη": ["Τι ακριβώς καλύπτει η Interamerican;", "Πόσο κοστίζει για τα παιδιά;"],
  "Κάρτα GProtasis": ["Είναι εντελώς δωρεάν;", "Σε ποια νοσοκομεία μπορώ να πάω;"]
};

export default function App() {
  const [messages, setMessages] = useState<{role: 'user'|'model', text: string}[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const [contextLabel, setContextLabel] = useState<string>('Αρχική Σελίδα');
  const [contextInstruction, setContextInstruction] = useState<string>('Ο χρήστης βρίσκεται στην αρχική σελίδα και βλέπει γενικά τις προσφορές.');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data === 'focus-input') inputRef.current?.focus();
      if (event.data && event.data.type === 'UPDATE_PAGE_CONTEXT') {
        setContextLabel(event.data.payload.label);
        setContextInstruction(event.data.payload.instruction);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleClearChat = () => {
    if (window.confirm("Είστε σίγουροι ότι θέλετε να διαγράψετε το ιστορικό της συνομιλίας;")) {
      setMessages([]);
      setInput('');
    }
  };

 const handleSend = async (textToSend?: string) => {
    // Αν της περάσουμε κείμενο (π.χ. από quick reply) παίρνει αυτό, 
    // αλλιώς παίρνει ό,τι έχει πληκτρολογήσει ο χρήστης στο input.
    const userMessage = (typeof textToSend === 'string' ? textToSend : input).trim();
    
    if (!userMessage) return;

    setInput(''); // Αδειάζουμε το input αμέσως
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsLoading(true);

    try {
      const dynamicInstructions = BOT_INSTRUCTIONS + 
        (contextInstruction ? `\n\n--- CURRENT USER CONTEXT --- \n${contextInstruction}\nΧρησιμοποίησε αυτή την πληροφορία αν ο χρήστης ρωτήσει αόριστα "πώς το κάνω;", "τι χρειάζομαι;", κλπ.` : "");

      const chatHistory = messages.map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
      }));

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [...chatHistory, { role: 'user', parts: [{ text: userMessage }] }],
        config: { systemInstruction: dynamicInstructions }
      });

      if (response.text) {
        setMessages(prev => [...prev, { role: 'model', text: response.text }]);
      }
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'model', text: "Υπήρξε ένα σφάλμα. Παρακαλώ δοκιμάστε ξανά." }]);
    } finally {
      setIsLoading(false);
      window.parent.postMessage('message-sent', '*'); 
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-white font-sans text-slate-800 overflow-hidden">  
      <header className="bg-white border-b border-slate-100 p-3 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2 text-[#0f2b5c]">
          <Bot className="w-5 h-5" />
          <span className="font-bold text-sm">Ψηφιακός Βοηθός AI</span>
        </div>
        
        {messages.length > 0 && (
          <button
            onClick={handleClearChat}
            className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-full transition-colors border border-red-100"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Καθαρισμός</span>
          </button>
        )}
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-5 bg-white custom-scroll">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 text-slate-500 opacity-80">
            <div className="w-16 h-16 bg-[#0f2b5c]/10 text-[#0f2b5c] rounded-full flex items-center justify-center">
              <Bot className="w-8 h-8" />
            </div>
            <div>
              <p className="font-bold text-slate-700 text-lg">Γεια σας!</p>
              <p className="text-sm max-w-[250px] mx-auto mt-1">Είμαι ο βοηθός του Συνεταιρισμού. Πώς μπορώ να σας εξυπηρετήσω σήμερα;</p>
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {message.role === 'model' && (
              <div className="w-8 h-8 rounded-full bg-[#0f2b5c] flex items-center justify-center shrink-0 shadow-sm mr-2 mt-1">
                <Bot className="w-4 h-4 text-white" />
              </div>
            )}
            
            <div className={`max-w-[85%] ${
              message.role === 'user' 
                ? 'bg-[#0f2b5c] text-white p-4 rounded-2xl rounded-tr-none shadow-md' 
                : 'bg-[#f8fafc] text-slate-800 p-4 rounded-2xl rounded-tl-none border border-slate-200'
            }`}>
              {message.role === 'user' ? (
                <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{message.text}</p>
              ) : (
                <div className="markdown-body text-[14px] leading-relaxed">
                  <ReactMarkdown
                    components={{
                      code(props) {
                        const {children, className, ...rest} = props;
                        const text = String(children).replace(/\n$/, '');
                        const match = /language-(\w+)/.exec(className || '');
                        
                        if (!match) {
                          return (
                            <span 
                              onClick={() => handleCopy(text)}
                              className="group relative inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-mono text-[13px] font-bold border border-blue-200 cursor-pointer hover:bg-blue-100 transition-colors shadow-sm mx-0.5"
                            >
                              {children}
                              {copiedText === text ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-blue-400 group-hover:text-blue-600 transition-colors" />}
                            </span>
                          );
                        }
                        return <code className={className} {...rest}>{children}</code>;
                      }
                    }}
                  >
                    {message.text}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="w-8 h-8 rounded-full bg-[#0f2b5c] flex items-center justify-center shrink-0 shadow-sm mr-2">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-[#f8fafc] p-4 rounded-2xl rounded-tl-none border border-slate-200 flex items-center">
              <Loader2 className="w-4 h-4 animate-spin text-[#0f2b5c]" />
              <span className="ml-2 text-xs text-slate-500 font-medium tracking-wide animate-pulse">Επεξεργασία...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      <footer className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-white border-t border-slate-200 shrink-0">
        <AnimatePresence>
          {contextLabel && contextLabel !== "Αρχική Σελίδα" && (
            <motion.div initial={{ opacity: 0, y: 10, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} exit={{ opacity: 0, y: 10, height: 0 }} className="mb-2.5 flex items-center overflow-hidden">
              <div className="bg-blue-50 text-blue-700 text-[11px] px-3 py-1.5 rounded-full font-bold flex items-center border border-blue-100 shadow-sm w-fit uppercase tracking-wide">
                <Info className="w-3.5 h-3.5 mr-1.5 text-blue-500" />
                Σχετικά με: {contextLabel}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-3 mb-1">
          {(QUICK_REPLIES[contextLabel || "Αρχική Σελίδα"] || QUICK_REPLIES["Αρχική Σελίδα"]).map((reply, index) => (
            <button key={index} onClick={() => handleSend(reply)} className="whitespace-nowrap bg-slate-50 hover:bg-slate-100 text-slate-700 text-[13px] py-2 px-4 rounded-full transition-colors border border-slate-200 shrink-0 shadow-sm font-medium">
              {reply}
            </button>
          ))}
        </div>

        <div className="relative flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
  if (e.key === 'Enter') {
    handleSend();
    inputRef.current?.blur(); // Κλείνει το πληκτρολόγιο αφαιρώντας το focus
  }
}}
            placeholder="Πληκτρολογήστε το μήνυμά σας..."
            style={{ fontSize: '16px' }} 
            className="w-full bg-slate-100 border border-slate-200 rounded-2xl py-3 pl-5 pr-12 text-base focus:ring-2 focus:ring-[#0f2b5c] focus:border-transparent transition-all outline-none"
          />
          <button
            onClick={() => {
  handleSend();
  inputRef.current?.blur();
}}
            disabled={!input.trim() || isLoading}
            className="absolute right-1.5 p-2 bg-[#0f2b5c] text-white rounded-xl hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </footer>
    </div>
  );
}
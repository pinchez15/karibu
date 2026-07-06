# Printer remote diagnostic — receipt cuts in the wrong place

Please follow these numbered steps and WhatsApp the three answers back. It takes less than five minutes.

---

1. Open any long pharmacy receipt on the Karibu web dashboard — one that has several medicines listed. It will open in a new tab and show the receipt on screen.

2. Press **Ctrl + P** on your keyboard (or **Command + P** on a Mac). The print dialog will open.

3. In the **Destination** (or **Printer**) box at the top of the dialog, click the dropdown and choose **Save as PDF**.

4. Click **Save** and save the file to your Desktop or anywhere you can find it.

5. Open the saved PDF file and look at the page count. It usually shows at the bottom of the screen as "1 of 2" or "1 of 1".

   **(a) How many pages does the PDF show?**
   Write the number — for example: "1 page" or "2 pages".

6. Go back to the print dialog (press Ctrl + P again on the receipt tab). Look at the **Destination / Printer** dropdown.

   **(b) What is the exact name of the printer?**
   Write the full name as it appears in the list — for example: "EPSON TM-T88VI" or "POS-58".

7. Open **Windows Settings → Printers & scanners** (or Mac **System Settings → Printers & Scanners**). Click on your thermal printer, then click **Printer properties** (Windows) or **Options & Supplies** (Mac). Look for a setting called paper size, form length, or roll length.

   **(c) What does the paper size or form length say in the driver settings?**
   Write exactly what it says — for example: "Receipt", "Continuous", "58mm x 200mm", or whatever is shown.

---

## What the answers tell us

| Answer | Meaning | Fix |
|--------|---------|-----|
| **(a) PDF = 1 page** and printer still cuts in the middle | The software is fine; the OS driver is cutting too early | In the printer driver settings, set paper type to **Receipt** or **Continuous roll**, and set the cut mode to **Cut at end of document** (not after every page). |
| **(a) PDF = 2 or more pages** | The receipt content is spilling onto a second page in the browser | A software update is on its way. Please install it and test again. |

Thank you for your help diagnosing this!

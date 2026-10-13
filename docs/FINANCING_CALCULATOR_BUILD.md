# Golf Cart Financing Calculator — Build Spec

This file describes how the calculator on tigoniot.com works (MP Assistant → Financing / side menu → Calculator), with every rate, fee and formula, so it can be rebuilt on any website. All numbers below are the ones the live calculator uses. The worked examples at the end were produced by the live code and can be used as test cases (to the penny).

---

## 1. What the calculator does

1. The salesperson enters the cart details (brand, price, new/used, accessories, pickup or delivery, tax, down payment).
2. It works out the **out-the-door (OTD) price** and the **loan amount** (OTD − down payment).
3. For that loan amount it shows every financing option for the brand, grouped by lender:
   - **Sheffield Financial** (promotional programs + standard rate grid by credit tier)
   - **Dealer Direct** (and **Dealer Direct No Frills** for other brands / used)
   - **DLL Financing (any year cart)**
   - A "Building credit?" note (Roadrunner Financial) for some brands
4. It highlights the **lowest monthly payment** and the **lowest total fees & interest**.
5. The salesperson can **select one option**: its program fee and origination fee are added to the totals box (§6.1).
6. It can print a one-page **customer sheet (PDF)** with the best options, or a **one-option sheet** for the selected option (§7).

---

## 2. Inputs

| Input | Type | Default | Notes |
|---|---|---|---|
| Brand | select | Evolution | Evolution · Tara · Icon & Epic · Teko · Denago · Other brands & used |
| Cart price | $ | — | Required. Nothing shows until a price is entered. |
| Condition | New / Used | New (Used when brand = "Other brands & used") | Changing brand resets condition to its default. |
| Evolution model | select | Other Evolution | Only shown for Evolution + New. Options: "Other Evolution", "XT4, XT6, GT4, GT6" (D-Max). |
| Accessories & add-ons | $ | 0 | |
| Dealer prep fee | $ | from rule (§3.1) | Editable; a "Reset" button returns it to the rule. |
| Pickup / Delivery | toggle | Pickup | |
| Store | select | Hatfield PA | Store list in §3.4. "Other store" lets you type a ZIP. |
| Destination | ZIP, "City, ST", full street address, or just a city name | — | Delivery only. Used for drive time and tax (§3.3). |
| Drive time | minutes / "1:45" / "1h 45m" | estimated (§3.3) | Delivery only. Typing a time overrides the estimate. |
| Delivery fee | $ | from rule (§3.2) | Delivery only. Editable. Over 4 hours: blank until the manager's 3rd-party quote is typed (§3.2.1). |
| Military discount | checkbox | off | −$200 |
| Sales tax % | % | from location (§3.5) | Editable, plus quick-pick presets. |
| Trade-in value | $ | 0 | Treated like extra down payment (lowers the loan amount, not the taxable amount). |
| Down payment | $ | 0 | |
| Term filter | All / each term | All | Filters the result lists to one term. |

Parsing money fields: strip `$`, `,` and spaces; anything not a number = 0.

---

## 3. Out-the-door price

### 3.1 Dealer prep fee
| Situation | Prep fee |
|---|---|
| Used cart (any brand) | **$0** |
| New Evolution D-Max model (XT4, XT6, GT4, GT6) | **$975** |
| Any other new cart | **$600** |

### 3.2 Delivery fee (from drive time in minutes)
- No drive time / pickup → **$0**
- Under 20 minutes → **$100 flat**
- Otherwise: `billedHalfHours = floor((minutes + 15) / 30)` → fee = **$100 + $50 × billedHalfHours**
  (i.e. drive time is rounded to the nearest half hour, with :15 and :45 rounding up)

| Drive time | Fee |
|---|---|
| 10 min | $100 |
| 19 min | $100 |
| 20–44 min | $150 |
| 45–74 min | $200 |
| 75–104 min | $250 |
| 105–134 min | $300 |
| 135–164 min | $350 |

#### 3.2.1 Deliveries over 4 hours (3rd-party carrier)
When the drive time (estimated or typed) is **over 240 minutes**, TIGON doesn't deliver itself — a 3rd-party carrier does and a manager quotes the price.
- A warning shows: **"Over 4 hours — contact your manager.** Deliveries this far go by a 3rd-party carrier…"
- Until the manager's quote is typed in the delivery fee box, delivery is **"to be confirmed" (TBC)**:
  - delivery is **left out** of the taxable amount, OTD and loan (fee = $0 in the math);
  - the totals show "Delivery (to be confirmed): TBC" and "Out-the-door price **(before delivery)**";
  - both PDFs print: "Delivery: price to be confirmed (3rd-party carrier) — not included in the prices above."
- Typing the manager's quote puts delivery back into the totals as a normal fee.

### 3.3 Drive-time estimate (no maps API needed)
Uses the straight-line distance between the store ZIP and the destination ZIP (ZIP centroid lat/lng):

```
crowMiles = haversine(store, destination)          // Earth radius 3958.8 mi
roadMiles = max(crowMiles × (1.2 + 0.15 × e^(−crowMiles/100)), 1)
mph       = 30 + 33 × (1 − e^(−roadMiles/60))
minutes   = round(roadMiles / mph × 60 + 3)
```
Example: Hatfield PA → Ocean View NJ = **110 min**. The salesperson can type the Google Maps time instead.

ZIP data: any US ZIP centroid table (the site uses the MIT-licensed `zipcodes` package: ZIP, lat, lng, city, county, state). "City, ST" is matched by city name + state (Saint→St, Mount→Mt, Fort→Ft, punctuation ignored); a city's location is the average of its ZIPs, and its county is the most common county among them.

**The destination always fills in a drive time.** Lookup order for whatever was typed:
1. Exact 5-digit ZIP, or exact "City, ST".
2. Any ZIP inside the text (e.g. a full address "123 Main St, Lecanto, FL 34461" → 34461).
3. The last two comma parts as "City, ST" (street addresses without a ZIP).
4. A city name alone → the largest place with that name.
5. A partly typed name → the first suggestion (suggestions = up to 6 cities starting with the text, largest first, narrowed by a typed state).

When the result was a guess (steps 2–5), show "Using <place> — check this is right". Each store uses its own map location (lat/lng) when known, else its ZIP. Example: Hatfield PA → Lecanto FL ≈ **1,018 min (~17 hr)** → flagged as 3rd-party (§3.2.1).

### 3.4 Stores (pickup / delivering store ZIP)
| Store | ZIP |
|---|---|
| Hatfield PA (default) | 19440 |
| Ocean View NJ | 08230 |
| Long Pond PA | 18334 |
| Dover DE | 19901 |
| Scranton-Wilkes-Barre PA | 18504 |
| Raleigh NC | 27603 |
| South Bend IN | 46637 |
| Gloucester Point VA | 23072 |
| Bayville NJ | 08721 |
| Waretown NJ | 08758 |
| Orangeburg SC | 29118 |
| Lecanto FL | 34461 |
| Swanton OH | 43558 |
| Rio Grande NJ | 08242 |
| Other store | typed ZIP |

### 3.5 Sales tax
Tax location = the **store** for pickup, the **destination** for delivery. The rate fills in automatically and can always be typed over.

| State / county | Rate |
|---|---|
| PA — Philadelphia County | 8% |
| PA — Allegheny County | 7% |
| PA — all other counties | 6% |
| NJ | 6.625% |
| DE | 0% |
| MD | 6% |
| Every other state | statewide rate from the table below |

Statewide rates (decimal) for the other states:

```
AL 0.04    AK 0       AZ 0.056   AR 0.065   CA 0.0725  CO 0.029   CT 0.0635  DC 0.06    FL 0.06
GA 0.04    HI 0.04    ID 0.06    IL 0.0625  IN 0.07    IA 0.06    KS 0.065   KY 0.06    LA 0.05
ME 0.055   MA 0.0625  MI 0.06    MN 0.06875 MS 0.07    MO 0.04225 MT 0       NE 0.055   NV 0.0685
NH 0       NM 0.04875 NY 0.04    NC 0.0475  ND 0.05    OH 0.0575  OK 0.045   OR 0       RI 0.07
SC 0.06    SD 0.042   TN 0.07    TX 0.0625  UT 0.061   VT 0.06    VA 0.053   WA 0.065   WV 0.06
WI 0.05    WY 0.04
```

In these states counties/cities usually add their own tax, so the note under the box says **"state rate; add any county/city tax"**:
AL AK AZ AR CA CO FL GA HI ID IL IA KS LA MN MS MO NE NV NM NY NC ND OH OK SC SD TN TX UT VT VA WA WV WI WY.

If the state can't be found at all, the box is left empty (red) for the salesperson to type.

### 3.6 OTD formula
```
militaryDiscount = military ? 200 : 0
taxable   = max(cartPrice + accessories + prepFee + deliveryFee − militaryDiscount, 0)
salesTax  = round2(taxable × taxRate)
OTD       = round2(taxable + salesTax)
loanAmount = round2(OTD − (downPayment + tradeIn))
```
(Delivery fee = 0 while delivery is TBC, §3.2.1.)
If `loanAmount ≤ 0`: show "The down payment covers the out-the-door price — nothing to finance."

`round2(x) = round((x + ε) × 100) / 100` (round half up to cents).

---

## 4. Financing math

For every option, with `loanAmount` from §3.6:

```
programFee     = feePct > 0 ? loanAmount × feePct + 10 : 0      // note the +$10
amountFinanced = loanAmount + programFee + originationFee
payment        = (see below)
totalOfPayments = round2(payment × term)
totalFeesAndInterest = round2(totalOfPayments − loanAmount)
```

### 4.1 Standard payment (Excel `PMT(rate/12, term, −amountFinanced)`)
```
if rate == 0:  payment = round2(amountFinanced / term)
else:          r = rate / 12
               payment = round2(amountFinanced × r / (1 − (1 + r)^(−term)))
```

### 4.2 "6 months no interest, then X%" — one level payment for the whole term
```
n = term − 6
r = rate / 12
k = (r == 0) ? 1/n : r / (1 − (1 + r)^(−n))
payment = round2(amountFinanced × k / (1 + 6 × k))
```

### 4.3 Availability rules
- **Min / max loan**: if loanAmount < minLoan or > maxLoan → greyed out, "Not available for this loan amount".
- **New carts only**: if the option is new-only and the cart is Used → greyed out, "New carts only".
- Greyed-out options are never picked as "lowest" and never go on the customer sheet.

### 4.4 Rate label
`"8.49%"`, `"0%"`, or `"6 months no interest, then 9.99%"`. Percentages drop trailing zeros (7.50% → "7.5%").

---

## 5. Rate tables

Rates are annual (APR). "Program fee" is a % of the loan amount **+ $10**. "Orig." is the flat origination fee added to the amount financed.

### 5.1 Sheffield Financial — standard rate grid (by credit tier)
Used for **Evolution, Tara, Teko, Denago, Other brands & used** (not Icon & Epic). No program fee.
Origination fee **$150** (**$125** for "Other brands & used", which is also limited to **2015 & newer carts**).

| Tier | 36 mo | 48 mo | 60 mo |
|---|---|---|---|
| **A** | 8.49% | 8.99% | 9.49% |
| B | 9.49% | 10.99% | 11.49% |
| C | 12.49% | 12.99% | 13.49% |
| D | 14.49% | 14.99% | 15.49% |
| E | 15.49% | 15.74% | 15.99% |

The page lists **Tier A** rows; Tiers B–E sit behind a "Show Tiers B to E" button (a tier × term table of payments). Only Tier A counts for "lowest" and the customer sheet.

### 5.2 Sheffield Financial — promotional programs
| Brand | Rate | Term | Program fee | Orig. | Credit tiers | Note |
|---|---|---|---|---|---|---|
| Evolution | 0% | 36 | 6.5% | $150 | A, B & C | |
| Evolution | 5.99% | 36 | 5% | $150 | A & B | |
| Tara | 6 mo no interest, then 9.99% | 48 | 4% | $150 | A & B | |
| Tara | 5.99% | 36 | 5% | $150 | A & B | |
| Icon & Epic | 0% | 24 | 8% | $150 | A, B & C | 2020 & newer carts |
| Icon & Epic | 0% | 36 | 8% | $150 | A, B & C | 2020 & newer carts |
| Teko | 0% | 24 | 6% | $150 | A & B | |
| Teko | 0% | 36 | 5.25% | $150 | A, B & C | |
| Teko | 0% | 48 | 6% | $150 | A, B & C | |
| Teko | 2.99% | 48 | 5.25% | $150 | A, B & C | |
| Teko | 6 mo no interest, then 5.99% | 36 | 4% | $150 | A & B | |
| Denago | 0% | 24 | 6% | $150 | A & B | |
| Denago | 0% | 36 | 5.5% | $150 | A, B & C | |
| Denago | 0% | 48 | 6% | $150 | A, B & C | |
| Denago | 3.99% | 48 | 5.75% | $150 | A, B & C | |
| Denago | 5.99% | 36 | 4.5% | $150 | A & B | |
| Other brands & used | 5.99% | 36 | 5% | $125 | A & B | 2015 & newer carts |
| Other brands & used | 6 mo no interest, then 9.99% | 48 | 4.5% | $125 | A & B | 2015 & newer carts |

### 5.3 Dealer Direct
Origination fee **$125**. For the five named brands these are **new carts only**. For "Other brands & used" they are allowed on used carts but limited to **2021 & newer carts**.

| Brand | Rate | Term | Program fee | New only? |
|---|---|---|---|---|
| Evolution | 0% | 24 | 6.75% | Yes |
| Evolution | 0% | 30 | 8% | Yes |
| Evolution | 0% | 36 | 10% | Yes |
| Evolution | 6.99% | 60 | 3.5% | Yes |
| Tara | — none — | | | |
| Icon & Epic | 0% | 24 | 2.5% | Yes |
| Icon & Epic | 0% | 36 | 6.25% | Yes |
| Icon & Epic | 1.99% | 36 | 4% | Yes |
| Icon & Epic | 2.99% | 48 | 5% | Yes |
| Teko | 0% | 24 | 4% | Yes |
| Teko | 0% | 36 | 6.5% | Yes |
| Teko | 0% | 48 | 6% | Yes |
| Teko | 2.99% | 48 | 5.75% | Yes |
| Teko | 5.99% | 60 | 2% | Yes |
| Denago | 0% | 24 | 3.75% | Yes |
| Denago | 0% | 36 | 5.75% | Yes |
| Denago | 0% | 48 | 6% | Yes |
| Denago | 2.99% | 48 | 5.25% | Yes |
| Denago | 5.99% | 60 | 1.75% | Yes |
| Other brands & used | 2.99% | 60 | 10% | No (2021 & newer) |
| Other brands & used | 3.29% | 36 | 6.25% | No (2021 & newer) |
| Other brands & used | 5.99% | 36 | 3.75% | No (2021 & newer) |
| Other brands & used | 5.99% | 48 | 4% | No (2021 & newer) |
| Other brands & used | 7.49% | 60 | 3% | No (2021 & newer) |

### 5.4 Dealer Direct No Frills — "Other brands & used" only
No program fee. Origination fee **$125**. Each row only applies inside its loan range.

| Rate | Term | Loan amount range |
|---|---|---|
| 2.79% | 18 | $1,500 – $3,500 |
| 8.79% | 36 | $3,000 – $30,000 |
| 8.79% | 48 | $3,000 – $30,000 |
| 8.79% | 60 | $3,000 – $30,000 |
| 8.99% | 72 | $20,000.01 – $50,000 |

> To confirm with the lender: the rate sheet this was built from labels the 36/48/60-month No Frills rate as 9.79% in one place but uses 8.79% in the calculation. The calculator uses **8.79%**.

### 5.5 DLL Financing (any year cart) — every brand, new or used
No program fee. Origination fee **$125**. No year limit.

| Rate | Term |
|---|---|
| 7.5% | 24 |
| 7.5% | 36 |
| 7.5% | 48 |
| 7.5% | 60 |

### 5.6 "Building credit?" note (Roadrunner Financial)
Shown under the results only when the term filter is "All":
- **Evolution, Denago:** Roadrunner Financial: rates 9.99% to 22.99% up to 84 months for Evolution; 10.74% to 22.99% up to 72 months for other brands. Approvals start at a 550 credit score; soft-pull application available.
- **Teko:** Roadrunner Financial: rates starting at 8.49%. Approvals start at a 550 credit score; soft-pull application available.
- **Other brands & used:** the Evolution text + "For 2016 and newer carts."
- **Tara, Icon & Epic:** none.

### 5.7 Which lender groups each brand shows
| Brand | Sheffield promos | Sheffield grid | Dealer Direct | DD No Frills | DLL | Roadrunner note |
|---|---|---|---|---|---|---|
| Evolution | ✓ | ✓ | ✓ | | ✓ | ✓ |
| Tara | ✓ | ✓ | | | ✓ | |
| Icon & Epic | ✓ | | ✓ | | ✓ | |
| Teko | ✓ | ✓ | ✓ | | ✓ | ✓ |
| Denago | ✓ | ✓ | ✓ | | ✓ | ✓ |
| Other brands & used | ✓ | ✓ ($125 orig.) | ✓ | ✓ | ✓ | ✓ |

Term filter buttons = every term that appears for the brand, sorted (e.g. Evolution: 24, 30, 36, 48, 60).

---

## 6. Results screen

- Two summary boxes over all **usable** options (promos + Tier A grid + Dealer Direct + No Frills + DLL, excluding greyed-out ones):
  - **Lowest monthly payment** — smallest `payment`
  - **Lowest total fees & interest** — smallest `totalFeesAndInterest`
  Each shows lender · rate · term (· tier) and the other figure.
- One card per lender group, titled: "Sheffield Financial", "Dealer Direct", "Dealer Direct No Frills", "DLL Financing (any year cart)".
- Each row: rate label · term, chips for credit tiers / program fee % / note / why unavailable, and on the right `$X/mo` and `Total $Y`.
- Tapping a row expands: Program fee · Origination fee · Amount financed · Total of payments · Total fees & interest.
- Footer: "Estimates only — the lender sets the final rate after a credit review."

### 6.1 Selecting an option
Every row (and every cell of the Tier B–E table) has **Select this option** (tap again = **Unselect**; only one at a time; unavailable rows can't be selected). When one is selected the totals box adds:

```
<lender · rate · term · tier>                         [Clear]
Program fee (feePct% + $10)        programFee
Origination fee                    orig
Amount financed                    amountFinanced      (bold)
Monthly payment × term             payment /mo
Total of payments                  totalOfPayments
Total with financing fees          OTD + programFee + orig   (only shown when there is a down payment / trade-in)
```
With nothing selected: "Select a financing option on the right to add its program fee to these totals." Changing brand / price / loan so the option no longer applies clears the selection.

---

## 7. Customer sheet (one-page PDF, US Letter)

**Which options go on it:**
1. Start from all usable options (same list as §6).
2. Group by lender (Dealer Direct and No Frills count as one lender) and term; keep the **lowest payment** in each lender + term group.
3. Also keep **every 0% option** (not the "6 months no interest" ones).
4. Sort by term, then by payment.

**Layout:**
- Red header band: "Your financing options" + brand · today's date.
- Optional cart line (e.g. "2024 Evolution D5 Ranger 4").
- Three boxes: Out-the-door price · Down payment · Amount to finance (red).
- "Out-the-door price includes: Cart $…, accessories $…, dealer prep $…, delivery $…, military discount −$…, sales tax $…" (only non-zero parts).
- Table: **Months** (printed once per term group, divider line between groups) · **Lender** · **Interest rate** · **Monthly payment** (bold red) · **Total you'll pay** · **Good to know** (the note, e.g. "New carts only").
- Yellow note box: "Please note: these are estimates. These payments are estimates only. Your actual interest rate and monthly payment are set by the lender after a credit review, based on the credit tier you're approved for. The rates shown are for the highest credit tier, so your rate may be higher."
- If the brand has a Roadrunner note: "Other options are available for customers who are building credit. Approvals start at a 550 credit score. Ask us about a soft-pull application to see your payment."
- Fine print: "\"Total you'll pay\" is every monthly payment added together, including interest and loan fees. All financing is subject to credit approval by the lender. Program terms can change without notice."
- The sheet shrinks the text (scales 1, 0.9, 0.8, 0.72, 0.65, 0.58, 0.52, 0.46) until it fits on one page.
- File name: `<Brand>-financing-<rounded OTD>.pdf`.
- If delivery is TBC (§3.2.1): the "includes" line says "delivery to be confirmed (not included)" and the TBC note prints under the table.

### 7.1 One-option sheet ("Selected option (PDF)")
Only shown when an option is selected (§6.1). One page, US Letter:
- Red header band: **"Your financing quote"** + brand · today's date; optional cart line.
- Headline box: "<Lender> · <rate> · <term> months (· Tier X)", the **monthly payment** large in red, and "for N months · total $…" on the right.
- Two-column table (striped; bold rows marked ★): Cart price · Accessories · Dealer prep fee · Delivery (or "Delivery (3rd-party carrier): To be confirmed") · Military discount · Sales tax · **Out-the-door price★** · Trade-in · Down payment · Loan amount · Program fee (x% + $10) · Origination fee · **Amount financed★** · Interest rate · Term · **Monthly payment★** · Total you'll pay (all payments) · Total fees & interest · Good to know. Rows that are $0 / empty are left out.
- TBC note if delivery is TBC.
- Yellow box: "Please note: this is an estimate. This payment is an estimate only. Your actual interest rate and monthly payment are set by the lender after a credit review, based on the credit tier you're approved for."
- PDFs are made in the browser with **jsPDF + jspdf-autotable** (no server).

---

## 8. Test cases (from the live calculator)

### 8.1 Evolution, New, $12,000, no accessories, pickup at Hatfield PA (Montgomery County → 6%), $0 down
- Prep fee $600 → taxable **$12,600.00**, tax **$756.00**, OTD **$13,356.00**, loan **$13,356.00**

| Lender | Tier(s) | Rate | Term | Program fee | Orig. | Amount financed | Payment | Total of payments | Fees & interest |
|---|---|---|---|---|---|---|---|---|---|
| Sheffield | A, B & C | 0% | 36 | 878.14 | 150 | 14,384.14 | **399.56** | 14,384.16 | 1,028.16 |
| Sheffield | A & B | 5.99% | 36 | 677.80 | 150 | 14,183.80 | **431.43** | 15,531.48 | 2,175.48 |
| Sheffield | Tier A | 8.49% | 36 | 0.00 | 150 | 13,506.00 | **426.29** | 15,346.44 | 1,990.44 |
| Sheffield | Tier A | 8.99% | 48 | 0.00 | 150 | 13,506.00 | **336.03** | 16,129.44 | 2,773.44 |
| Sheffield | Tier A | 9.49% | 60 | 0.00 | 150 | 13,506.00 | **283.59** | 17,015.40 | 3,659.40 |
| Dealer Direct | | 0% | 24 | 911.53 | 125 | 14,392.53 | **599.69** | 14,392.56 | 1,036.56 |
| Dealer Direct | | 0% | 30 | 1,078.48 | 125 | 14,559.48 | **485.32** | 14,559.60 | 1,203.60 |
| Dealer Direct | | 0% | 36 | 1,345.60 | 125 | 14,826.60 | **411.85** | 14,826.60 | 1,470.60 |
| Dealer Direct | | 6.99% | 60 | 477.46 | 125 | 13,958.46 | **276.33** | 16,579.80 | 3,223.80 |
| DLL | | 7.5% | 24 | 0.00 | 125 | 13,481.00 | **606.64** | 14,559.36 | 1,203.36 |
| DLL | | 7.5% | 36 | 0.00 | 125 | 13,481.00 | **419.34** | 15,096.24 | 1,740.24 |
| DLL | | 7.5% | 48 | 0.00 | 125 | 13,481.00 | **325.96** | 15,646.08 | 2,290.08 |
| DLL | | 7.5% | 60 | 0.00 | 125 | 13,481.00 | **270.13** | 16,207.80 | 2,851.80 |

- Lowest monthly payment: **DLL 60 mo, $270.13**
- Lowest total fees & interest: **Sheffield 0% 36 mo, $1,028.16**
- Customer sheet rows: 24 DD 0% $599.69 · 24 DLL $606.64 · 30 DD 0% $485.32 · 36 Sheffield 0% $399.56 · 36 DD 0% $411.85 · 36 DLL $419.34 · 48 DLL $325.96 · 48 Sheffield 8.99% $336.03 · 60 DLL $270.13 · 60 DD 6.99% $276.33 · 60 Sheffield 9.49% $283.59

### 8.2 Other brands & used, Used, $8,000, delivery 1 hr 45 min to NJ (6.625%), $1,000 down
- Prep $0, delivery 105 min → **$300** → taxable **$8,300.00**, tax **$549.88**, OTD **$8,849.88**, loan **$7,849.88**

| Lender | Tier(s) | Rate | Term | Program fee | Orig. | Amount financed | Payment | Total of payments | Fees & interest | |
|---|---|---|---|---|---|---|---|---|---|---|
| Sheffield | A & B | 5.99% | 36 | 402.49 | 125 | 8,377.37 | **254.82** | 9,173.52 | 1,323.64 | |
| Sheffield | A & B | 6 mo no interest, then 9.99% | 48 | 363.24 | 125 | 8,338.12 | **201.79** | 9,685.92 | 1,836.04 | |
| Sheffield | Tier A | 8.49% | 36 | 0.00 | 125 | 7,974.88 | **251.71** | 9,061.56 | 1,211.68 | |
| Sheffield | Tier A | 8.99% | 48 | 0.00 | 125 | 7,974.88 | **198.42** | 9,524.16 | 1,674.28 | |
| Sheffield | Tier A | 9.49% | 60 | 0.00 | 125 | 7,974.88 | **167.45** | 10,047.00 | 2,197.12 | |
| Dealer Direct | | 2.99% | 60 | 794.99 | 125 | 8,769.87 | **157.54** | 9,452.40 | 1,602.52 | |
| Dealer Direct | | 3.29% | 36 | 500.62 | 125 | 8,475.50 | **247.56** | 8,912.16 | 1,062.28 | |
| Dealer Direct | | 5.99% | 36 | 304.37 | 125 | 8,279.25 | **251.83** | 9,065.88 | 1,216.00 | |
| Dealer Direct | | 5.99% | 48 | 324.00 | 125 | 8,298.88 | **194.86** | 9,353.28 | 1,503.40 | |
| Dealer Direct | | 7.49% | 60 | 245.50 | 125 | 8,220.38 | **164.68** | 9,880.80 | 2,030.92 | |
| DD No Frills | | 2.79% | 18 | — | 125 | — | — | — | — | not available (loan > $3,500) |
| DD No Frills | | 8.79% | 36 | 0.00 | 125 | 7,974.88 | **252.82** | 9,101.52 | 1,251.64 | |
| DD No Frills | | 8.79% | 48 | 0.00 | 125 | 7,974.88 | **197.66** | 9,487.68 | 1,637.80 | |
| DD No Frills | | 8.79% | 60 | 0.00 | 125 | 7,974.88 | **164.73** | 9,883.80 | 2,033.92 | |
| DD No Frills | | 8.99% | 72 | — | 125 | — | — | — | — | not available (loan < $20,000.01) |
| DLL | | 7.5% | 24 | 0.00 | 125 | 7,974.88 | **358.87** | 8,612.88 | 763.00 | |
| DLL | | 7.5% | 36 | 0.00 | 125 | 7,974.88 | **248.07** | 8,930.52 | 1,080.64 | |
| DLL | | 7.5% | 48 | 0.00 | 125 | 7,974.88 | **192.82** | 9,255.36 | 1,405.48 | |
| DLL | | 7.5% | 60 | 0.00 | 125 | 7,974.88 | **159.80** | 9,588.00 | 1,738.12 | |

- Lowest monthly payment: **Dealer Direct 2.99% 60 mo, $157.54**
- Lowest total fees & interest: **DLL 24 mo, $763.00**

### 8.3 Single-formula checks
- PMT: $10,000 at 8.49% for 36 → **$315.63**
- PMT: $10,000 at 0% for 36 → **$277.78**
- 6 months no interest then 9.99%, $10,000 for 48 → **$242.01**
- Drive estimate Hatfield PA (40.2984, −75.2831) → Ocean View NJ (39.2225, −74.7042) → **110 min**

---

## 9. Reference implementation (complete, JavaScript, no dependencies)

This is the live calculator's math module (`frontend/src/mp/finance/financeCalc.ts`) compiled to plain JavaScript — every rate table, fee rule and formula above. Save it as `financeCalc.js` and use it on any site. It reproduces every test case in §8 to the penny.

```js
const BRANDS = [
  { id: "evolution", label: "Evolution" },
  { id: "tara", label: "Tara" },
  { id: "icon", label: "Icon & Epic" },
  { id: "teko", label: "Teko" },
  { id: "denago", label: "Denago" },
  { id: "other", label: "Other brands & used" }
];
const brandLabel = (b) => BRANDS.find((x) => x.id === b)?.label || b;
const LENDER_LABEL = {
  sheffield: "Sheffield Financial",
  dd: "Dealer Direct",
  ddnf: "Dealer Direct No Frills",
  dll: "DLL Financing"
};
function brandFromMake(make, isUsed) {
  const m = (make || "").toLowerCase();
  if (isUsed) return "other";
  if (m.includes("evolution")) return "evolution";
  if (m.includes("tara")) return "tara";
  if (m.includes("icon") || m.includes("epic")) return "icon";
  if (m.includes("teko")) return "teko";
  if (m.includes("denago")) return "denago";
  return "other";
}
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const MILITARY_DISCOUNT = 200;
function prepFeeFor(condition, brand, evoModel) {
  if (condition === "used") return 0;
  if (brand === "evolution" && evoModel === "dmax") return 975;
  return 600;
}
function deliveryFee(driveMinutes) {
  if (!driveMinutes || driveMinutes <= 0) return { fee: 0, billedHalfHours: 0, explain: "" };
  if (driveMinutes < 20) return { fee: 100, billedHalfHours: 0, explain: "Under 20 min: flat $100" };
  const h = Math.floor((driveMinutes + 15) / 30);
  const fee = 100 + 50 * h;
  return { fee, billedHalfHours: h, explain: `Billed as ${fmtDuration(h * 30)}: $100 + ${h} \xD7 $50 = $${fee}` };
}
function fmtDuration(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m} min`;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}
function haversineMiles(a, b) {
  const R = 3958.8;
  const rad = (d) => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function estimateDriveMinutes(a, b) {
  const crow = haversineMiles(a, b);
  const road = Math.max(crow * (1.2 + 0.15 * Math.exp(-crow / 100)), 1);
  const mph = 30 + 33 * (1 - Math.exp(-road / 60));
  return Math.round(road / mph * 60 + 3);
}
const STATE_TAX = {
  AL: 0.04,
  AK: 0,
  AZ: 0.056,
  AR: 0.065,
  CA: 0.0725,
  CO: 0.029,
  CT: 0.0635,
  DC: 0.06,
  FL: 0.06,
  GA: 0.04,
  HI: 0.04,
  ID: 0.06,
  IL: 0.0625,
  IN: 0.07,
  IA: 0.06,
  KS: 0.065,
  KY: 0.06,
  LA: 0.05,
  ME: 0.055,
  MA: 0.0625,
  MI: 0.06,
  MN: 0.06875,
  MS: 0.07,
  MO: 0.04225,
  MT: 0,
  NE: 0.055,
  NV: 0.0685,
  NH: 0,
  NM: 0.04875,
  NY: 0.04,
  NC: 0.0475,
  ND: 0.05,
  OH: 0.0575,
  OK: 0.045,
  OR: 0,
  RI: 0.07,
  SC: 0.06,
  SD: 0.042,
  TN: 0.07,
  TX: 0.0625,
  UT: 0.061,
  VT: 0.06,
  VA: 0.053,
  WA: 0.065,
  WV: 0.06,
  WI: 0.05,
  WY: 0.04
};
const LOCAL_TAX_STATES = /* @__PURE__ */ new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IA",
  "KS",
  "LA",
  "MN",
  "MS",
  "MO",
  "NE",
  "NV",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY"
]);
function taxRateFor(state, county) {
  const st = (state || "").toUpperCase();
  const c = (county || "").toLowerCase();
  if (st === "PA") return c.includes("philadelphia") ? 0.08 : c.includes("allegheny") ? 0.07 : 0.06;
  if (st === "NJ") return 0.06625;
  if (st === "DE") return 0;
  if (st === "MD") return 0.06;
  return st in STATE_TAX ? STATE_TAX[st] : null;
}
const localTaxMayApply = (state) => LOCAL_TAX_STATES.has((state || "").toUpperCase());
function computeOtd(i) {
  const militaryDiscount = i.military ? MILITARY_DISCOUNT : 0;
  const taxable = Math.max((i.cartPrice || 0) + (i.accessories || 0) + (i.prepFee || 0) + (i.deliveryFee || 0) - militaryDiscount, 0);
  const salesTax = round2(taxable * (i.taxRate || 0));
  const otd = round2(taxable + salesTax);
  return { taxable: round2(taxable), salesTax, otd, loanAmount: round2(otd - (i.downPayment || 0)), militaryDiscount };
}
function pmt(amount, annualRate, term) {
  if (annualRate === 0) return round2(amount / term);
  const r = annualRate / 12;
  return round2(amount * r / (1 - (1 + r) ** -term));
}
function pmtSixFree(amount, annualRate, term) {
  const n = term - 6;
  const r = annualRate / 12;
  const k = r === 0 ? 1 / n : r / (1 - (1 + r) ** -n);
  return round2(amount * k / (1 + 6 * k));
}
function quote(o, loanAmount, condition) {
  const programFee = o.feePct > 0 ? loanAmount * o.feePct + 10 : 0;
  const amountFinanced = loanAmount + programFee + o.orig;
  const payment = o.sixFree ? pmtSixFree(amountFinanced, o.rate, o.term) : pmt(amountFinanced, o.rate, o.term);
  const totalOfPayments = round2(payment * o.term);
  let unavailable = "";
  if (o.minLoan !== void 0 && loanAmount < o.minLoan || o.maxLoan !== void 0 && loanAmount > o.maxLoan) unavailable = "Not available for this loan amount";
  else if (o.newOnly && condition === "used") unavailable = "New carts only";
  return {
    option: o,
    programFee: round2(programFee),
    amountFinanced: round2(amountFinanced),
    payment,
    totalOfPayments,
    totalFeesAndInterest: round2(totalOfPayments - loanAmount),
    unavailable
  };
}
const rateLabel = (o) => {
  const pct = `${+(o.rate * 100).toFixed(3)}%`;
  return o.sixFree ? `6 months no interest, then ${pct}` : pct;
};
const TIER_GRID = {
  A: [0.0849, 0.0899, 0.0949],
  B: [0.0949, 0.1099, 0.1149],
  C: [0.1249, 0.1299, 0.1349],
  D: [0.1449, 0.1499, 0.1549],
  E: [0.1549, 0.1574, 0.1599]
};
const TIERS = ["A", "B", "C", "D", "E"];
const GRID_TERMS = [36, 48, 60];
let seq = 0;
const opt = (o) => ({ ...o, id: `${o.lender}-${o.term}-${o.rate}-${o.feePct}-${o.tier || ""}-${o.sixFree ? "six" : ""}-${o.minLoan ?? ""}-${seq++}` });
function grid(orig) {
  const out = [];
  for (const t of TIERS) GRID_TERMS.forEach((term, i) => out.push(opt({ lender: "sheffield", rate: TIER_GRID[t][i], term, feePct: 0, orig, tier: t })));
  return out;
}
const dll = () => [24, 36, 48, 60].map((term) => opt({ lender: "dll", rate: 0.075, term, feePct: 0, orig: 125 }));
const sh = (rate, term, feePct, tiers, extra = {}) => opt({ lender: "sheffield", rate, term, feePct, orig: 150, tiers, ...extra });
const dd = (rate, term, feePct, extra = {}) => opt({ lender: "dd", rate, term, feePct, orig: 125, note: "New carts only", newOnly: true, ...extra });
const RR_EVO = "Roadrunner Financial: rates 9.99% to 22.99% up to 84 months for Evolution; 10.74% to 22.99% up to 72 months for other brands. Approvals start at a 550 credit score; soft-pull application available.";
const PROGRAMS = {
  evolution: {
    promos: [sh(0, 36, 0.065, "A, B & C"), sh(0.0599, 36, 0.05, "A & B")],
    grid: grid(150),
    dealerDirect: [dd(0, 24, 0.0675), dd(0, 30, 0.08), dd(0, 36, 0.1), dd(0.0699, 60, 0.035)],
    noFrills: [],
    dll: dll(),
    roadrunner: RR_EVO
  },
  tara: {
    promos: [sh(0.0999, 48, 0.04, "A & B", { sixFree: true }), sh(0.0599, 36, 0.05, "A & B")],
    grid: grid(150),
    dealerDirect: [],
    noFrills: [],
    dll: dll(),
    roadrunner: ""
  },
  icon: {
    promos: [sh(0, 24, 0.08, "A, B & C", { note: "2020 & newer carts" }), sh(0, 36, 0.08, "A, B & C", { note: "2020 & newer carts" })],
    grid: [],
    dealerDirect: [dd(0, 24, 0.025), dd(0, 36, 0.0625), dd(0.0199, 36, 0.04), dd(0.0299, 48, 0.05)],
    noFrills: [],
    dll: dll(),
    roadrunner: ""
  },
  teko: {
    promos: [
      sh(0, 24, 0.06, "A & B"),
      sh(0, 36, 0.0525, "A, B & C"),
      sh(0, 48, 0.06, "A, B & C"),
      sh(0.0299, 48, 0.0525, "A, B & C"),
      sh(0.0599, 36, 0.04, "A & B", { sixFree: true })
    ],
    grid: grid(150),
    dealerDirect: [dd(0, 24, 0.04), dd(0, 36, 0.065), dd(0, 48, 0.06), dd(0.0299, 48, 0.0575), dd(0.0599, 60, 0.02)],
    noFrills: [],
    dll: dll(),
    roadrunner: "Roadrunner Financial: rates starting at 8.49%. Approvals start at a 550 credit score; soft-pull application available."
  },
  denago: {
    promos: [
      sh(0, 24, 0.06, "A & B"),
      sh(0, 36, 0.055, "A, B & C"),
      sh(0, 48, 0.06, "A, B & C"),
      sh(0.0399, 48, 0.0575, "A, B & C"),
      sh(0.0599, 36, 0.045, "A & B")
    ],
    grid: grid(150),
    dealerDirect: [dd(0, 24, 0.0375), dd(0, 36, 0.0575), dd(0, 48, 0.06), dd(0.0299, 48, 0.0525), dd(0.0599, 60, 0.0175)],
    noFrills: [],
    dll: dll(),
    roadrunner: RR_EVO
  },
  other: {
    promos: [
      sh(0.0599, 36, 0.05, "A & B", { orig: 125, note: "2015 & newer carts" }),
      sh(0.0999, 48, 0.045, "A & B", { orig: 125, sixFree: true, note: "2015 & newer carts" })
    ],
    grid: grid(125).map((o) => ({ ...o, note: "2015 & newer carts" })),
    dealerDirect: [
      dd(0.0299, 60, 0.1, { note: "2021 & newer carts", newOnly: false }),
      dd(0.0329, 36, 0.0625, { note: "2021 & newer carts", newOnly: false }),
      dd(0.0599, 36, 0.0375, { note: "2021 & newer carts", newOnly: false }),
      dd(0.0599, 48, 0.04, { note: "2021 & newer carts", newOnly: false }),
      dd(0.0749, 60, 0.03, { note: "2021 & newer carts", newOnly: false })
    ],
    noFrills: [
      opt({ lender: "ddnf", rate: 0.0279, term: 18, feePct: 0, orig: 125, minLoan: 1500, maxLoan: 3500 }),
      ...[36, 48, 60].map((term) => opt({ lender: "ddnf", rate: 0.0879, term, feePct: 0, orig: 125, minLoan: 3e3, maxLoan: 3e4 })),
      opt({ lender: "ddnf", rate: 0.0899, term: 72, feePct: 0, orig: 125, minLoan: 20000.01, maxLoan: 5e4 })
    ],
    dll: dll(),
    roadrunner: `${RR_EVO} For 2016 and newer carts.`
  }
};
function termsFor(brand) {
  const p = PROGRAMS[brand];
  return Array.from(new Set([...p.promos, ...p.grid, ...p.dealerDirect, ...p.noFrills, ...p.dll].map((o) => o.term))).sort((a, b) => a - b);
}
function buildResults(brand, loanAmount, condition, termFilter) {
  const p = PROGRAMS[brand];
  const keep = (o) => termFilter === "all" || o.term === termFilter;
  const q = (list) => list.filter(keep).map((o) => quote(o, loanAmount, condition));
  const r = {
    loanAmount,
    promos: q(p.promos),
    grid: q(p.grid),
    dealerDirect: q(p.dealerDirect),
    noFrills: q(p.noFrills),
    dll: q(p.dll),
    roadrunner: termFilter === "all" ? p.roadrunner : ""
  };
  const eligible = allEligible(r);
  r.lowestPayment = eligible.reduce((best, x) => !best || x.payment < best.payment ? x : best, void 0);
  r.lowestCost = eligible.reduce((best, x) => !best || x.totalFeesAndInterest < best.totalFeesAndInterest ? x : best, void 0);
  return r;
}
function allEligible(r) {
  return [...r.promos, ...r.grid.filter((x) => x.option.tier === "A"), ...r.dealerDirect, ...r.noFrills, ...r.dll].filter((x) => !x.unavailable);
}
function customerSheetRows(r) {
  const eligible = allEligible(r);
  const lenderGroup = (l) => l === "ddnf" ? "dd" : l;
  const best = /* @__PURE__ */ new Map();
  for (const x of eligible) {
    const k = `${lenderGroup(x.option.lender)}|${x.option.term}`;
    const cur = best.get(k);
    if (!cur || x.payment < cur.payment) best.set(k, x);
  }
  const keep = new Set(best.values());
  for (const x of eligible) if (x.option.rate === 0 && !x.option.sixFree) keep.add(x);
  return Array.from(keep).sort((a, b) => a.option.term - b.option.term || a.payment - b.payment);
}
export {
  BRANDS,
  LENDER_LABEL,
  MILITARY_DISCOUNT,
  PROGRAMS,
  TIERS,
  allEligible,
  brandFromMake,
  brandLabel,
  buildResults,
  computeOtd,
  customerSheetRows,
  deliveryFee,
  estimateDriveMinutes,
  fmtDuration,
  haversineMiles,
  localTaxMayApply,
  pmt,
  pmtSixFree,
  prepFeeFor,
  quote,
  rateLabel,
  round2,
  taxRateFor,
  termsFor
};
```

---

## 10. How to build it on another website

### 10.1 What you need
| Piece | What to use |
|---|---|
| Math + rates | `financeCalc.js` from §9 (copy as is). |
| ZIP → location (drive time + tax) | Any US ZIP table with lat, lng, city, county, state — e.g. the free `zipcodes` npm package, or a JSON/CSV file loaded once. Optional: skip it and let people type the drive time and tax rate. |
| PDFs (optional) | `jspdf` + `jspdf-autotable` from a CDN (cdnjs / jsDelivr). |
| Page | Plain HTML + JS, or any framework (React, Vue, WordPress block, Shopify section). |

### 10.2 Steps
1. **Add the module.** Put `financeCalc.js` on the site and load it with `<script type="module">` (or import it in your bundler).
2. **Build the form** with the inputs in §2: brand, cart price, new/used, Evolution model (only for Evolution + new), accessories, prep fee, pickup/delivery, store, destination, drive time, delivery fee, military, tax %, trade-in, down payment, term filter. Parse money with `Number(text.replace(/[$,\s]/g, '')) || 0`.
3. **On every change, recalculate:**
   ```js
   import * as F from './financeCalc.js';

   const prep = prepOverride ?? F.prepFeeFor(condition, brand, evoModel);
   const minutes = mode === 'delivery' ? (typedMinutes ?? (store && dest ? F.estimateDriveMinutes(store, dest) : null)) : null;
   const tbc = mode === 'delivery' && minutes > 240 && !managerQuote;               // §3.2.1
   const delivery = mode !== 'delivery' || tbc ? 0 : (managerQuote ?? F.deliveryFee(minutes).fee);
   const place = mode === 'pickup' ? store : dest;                                    // §3.5
   const taxRate = typedTax ?? F.taxRateFor(place?.state, place?.county) ?? 0;
   const otd = F.computeOtd({ cartPrice, accessories, prepFee: prep, deliveryFee: delivery, military, taxRate,
                              downPayment: down + tradeIn });
   if (otd.loanAmount <= 0) showNothingToFinance();
   const results = F.buildResults(brand, otd.loanAmount, condition, termFilter);      // 'all' or a number
   ```
4. **Show the totals box** (cart, accessories, prep, delivery / "TBC", military, tax, OTD, trade-in, down, loan amount) and the **two summary boxes** from `results.lowestPayment` and `results.lowestCost`.
5. **Show one card per lender** from `results.promos` + `results.grid` (Tier A rows; Tiers B–E behind a button), `results.dealerDirect`, `results.noFrills`, `results.dll`. Each quote has `payment`, `totalOfPayments`, `programFee`, `amountFinanced`, `totalFeesAndInterest`, `unavailable` (grey the row out when not empty) and `option` (`F.rateLabel(option)`, `term`, `tiers`, `feePct`, `note`). Put `results.roadrunner` under the cards when it isn't empty.
6. **Term filter buttons** = `F.termsFor(brand)` plus "All".
7. **Select an option** (§6.1): keep the chosen `option.id`; add its program fee, origination fee, amount financed and payment to the totals box.
8. **PDFs** (§7, §7.1): rows for the customer sheet = `F.customerSheetRows(results)`. Draw the header band, the three boxes, the table and the notes with jsPDF; shrink with the scales in §7 until it fits one page.
9. **Test** with the cases in §8 — the numbers must match to the penny.

### 10.3 Customer-facing version (public website)
For a shopper-facing page, keep the same math but simplify the form: brand, price, new/used, ZIP (for tax and delivery), down payment and trade-in. Show the **lowest monthly payment** per term (the customer-sheet rows) instead of every lender, add the yellow "these are estimates" note, and put a **"Get pre-approved" / "Talk to us"** button that sends the lead (name, phone, chosen option) to your CRM or webhook. Keep lender names and rates exactly as in §5 — and update them whenever the lender rate sheets change.

### 10.4 Keeping rates up to date
All rates live in one place: the `PROGRAMS` table and `TIER_GRID` in `financeCalc.js` (§5 in this file). When a lender changes a program, edit those rows on every site, then re-check §8 (expected numbers will change for the edited programs).

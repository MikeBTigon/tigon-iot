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
5. It can print a one-page **customer sheet (PDF)**.

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
| Destination | ZIP or "City, ST" | — | Delivery only. Used for drive time and tax. |
| Drive time | minutes / "1:45" / "1h 45m" | estimated (§3.3) | Delivery only. Typing a time overrides the estimate. |
| Delivery fee | $ | from rule (§3.2) | Delivery only. Editable. |
| Military discount | checkbox | off | −$200 |
| Sales tax % | % | from location (§3.5) | Editable, plus quick-pick presets. |
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
Tax location = the **store** for pickup, the **destination** for delivery.

| State / county | Rate |
|---|---|
| PA — Philadelphia County | 8% |
| PA — Allegheny County | 7% |
| PA — all other counties | 6% |
| NJ | 6.625% |
| DE | 0% |
| MD | 6% |
| Any other state | not known → salesperson types the rate (field turns red until filled) |

### 3.6 OTD formula
```
militaryDiscount = military ? 200 : 0
taxable   = max(cartPrice + accessories + prepFee + deliveryFee − militaryDiscount, 0)
salesTax  = round2(taxable × taxRate)
OTD       = round2(taxable + salesTax)
loanAmount = round2(OTD − downPayment)
```
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

## 9. Reference implementation (TypeScript, no dependencies)

```ts
type Lender = 'sheffield' | 'dd' | 'ddnf' | 'dll';
interface Option { lender: Lender; rate: number; term: number; feePct: number; orig: number;
  sixFree?: boolean; tier?: string; tiers?: string; note?: string; newOnly?: boolean; minLoan?: number; maxLoan?: number }

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function pmt(amount: number, rate: number, term: number) {
  if (rate === 0) return round2(amount / term);
  const r = rate / 12;
  return round2((amount * r) / (1 - (1 + r) ** -term));
}
function pmtSixFree(amount: number, rate: number, term: number) {
  const n = term - 6, r = rate / 12;
  const k = r === 0 ? 1 / n : r / (1 - (1 + r) ** -n);
  return round2((amount * k) / (1 + 6 * k));
}
function quote(o: Option, loan: number, used: boolean) {
  const programFee = o.feePct > 0 ? loan * o.feePct + 10 : 0;
  const amountFinanced = loan + programFee + o.orig;
  const payment = o.sixFree ? pmtSixFree(amountFinanced, o.rate, o.term) : pmt(amountFinanced, o.rate, o.term);
  const totalOfPayments = round2(payment * o.term);
  const unavailable =
    (o.minLoan !== undefined && loan < o.minLoan) || (o.maxLoan !== undefined && loan > o.maxLoan) ? 'Not available for this loan amount' :
    o.newOnly && used ? 'New carts only' : '';
  return { option: o, programFee: round2(programFee), amountFinanced: round2(amountFinanced), payment, totalOfPayments,
    totalFeesAndInterest: round2(totalOfPayments - loan), unavailable };
}
function deliveryFee(minutes: number | null) {
  if (!minutes || minutes <= 0) return 0;
  if (minutes < 20) return 100;
  return 100 + 50 * Math.floor((minutes + 15) / 30);
}
function otd(cart: number, acc: number, prep: number, delivery: number, military: boolean, taxRate: number, down: number) {
  const taxable = Math.max(cart + acc + prep + delivery - (military ? 200 : 0), 0);
  const tax = round2(taxable * taxRate);
  const total = round2(taxable + tax);
  return { taxable: round2(taxable), tax, otd: total, loan: round2(total - down) };
}
```
Build each brand's option list from the tables in §5 (grid rows carry `tier`; Dealer Direct rows carry `newOnly: true, note: 'New carts only'` except for "Other brands & used").

# Taste: research, risks, and how the prototype handles them

Research done October 2026. **Taste is being launched from Canada.** **This is not
legal or tax advice.** Have a Canadian lawyer and accountant review it before launch.

## The idea in one line

A social app where everyday people share honest recommendations (love it / it's fine /
skip it). When someone buys through a labeled paid link, the person who recommended it
gets 70% of the store's commission and Taste keeps 30%.

## What already exists

| Who | What they do | What it means for us |
|---|---|---|
| **LTK** | Shopping app for influencers. 1M+ brands, ~44M monthly shoppers, typically 10–25% commission. Closed network. | Big and proven, but built for influencers, not regular people. |
| **ShopMy** | Open creator storefronts, ~175K creators and 50K brands, 10–30% commissions. | The fast-growing challenger. Also influencer-focused. |
| **Amazon Influencer Program** | Creator storefronts on Amazon. | Strong for creators, but only Amazon products. |
| **Beli** | Friends rank restaurants. Grew through friend invites, TikTok, leaderboards, streaks and campus competitions. | Proof that "friends' taste" spreads. **The growth playbook to copy.** |
| **Refer A Friend App** (Dec 2025) | Pays people for referring local businesses. | Shows demand for paying everyday people. Small so far. |

**The gap:** everyday people with good taste and no influencer audience. Nobody is
building for them with honesty as the core promise.

## The 6 biggest risks, and what we did about each

### 1. Looking like a scam ("spam your friends, earn money")
A 2011 TechCrunch headline about a similar app, Shopcade, read *"Spam Friends, Earn
Money."* That's the reputation to avoid.

**In the prototype:**
- The pitch is **honesty first, money second.** The landing page leads with "What would
  your most honest friend buy?", and earning is a small "thank you", not the headline.
- Everyone takes the **Taste pledge** at signup: only recommend what you've used, be
  honest, be kind.
- New members **can't earn at all** until they've built trust (see #3).
- A public **"How we keep Taste honest"** page explains every rule in plain English.

### 2. Breaking advertising law (Canada first, US too)
**Canada:** the **Competition Act** bans false or misleading advertising, and that
includes anyone promoting a product, influencers included. The Competition Bureau has
said that reviews must be based on **real experience**, that **connections to a business
must be disclosed**, and that **buying fake reviews** is punished. One app paid $310,000
of a $1.5M penalty for buying positive reviews. **Ad Standards' Influencer Marketing
Disclosure Guidelines** (updated October 2025) set the industry standard for clear labels.

**US:** if Americans use Taste, the US rules apply to them too:
- **Fake reviews rule (effective Oct 2024):** you can't pay for reviews of a particular
  sentiment, or post reviews from people with no real experience. Penalties run up to
  ~$51,744 per violation.
- **Endorsement Guides (2023):** affiliate links must be clearly disclosed right next to
  the link. "Paid link" counts as clear; "affiliate link" alone, a "buy now" button, or
  a disclosure hidden in a bio does not.

**In the prototype:**
- Every paid link shows **"Paid link · @name may earn a commission if you buy"** directly
  beside it. Members can't turn it off.
- **"Skip it" posts rank exactly the same** as "Love it" posts. Ranking never looks at
  verdicts, paid links or earnings. A test proves this.
- The guidelines ban AI-written and second-hand reviews and require disclosing ties to a
  brand. AI moderation flags posts that read like ads or AI text.

### 3. Spam and fake accounts
Any app that pays attracts cheaters. The strategy: **make cheating not worth it.**

**In the prototype:**
- **Trust levels.** New members get 3 posts a day, regular (unpaid) links only, and
  don't appear in Discover. Members (7+ days, 3+ posts, helpful votes from 5 different
  people) unlock paid links. Trusted members (30+ days, 20+ helpers, no removed posts)
  get the highest limits.
- **One person, one account.** Phone verification is required to post, and identity
  verification is required to get paid.
- **Every post is checked.** Rules catch ad phrases, ALL CAPS, emails and phone
  numbers, links pasted into the text, and copy-pasted posts. An AI review runs too when
  an API key is set. The stricter result always wins.
- **Link safety.** No short links, which hide where they go. HTTPS only. Other people's
  tracking codes are stripped so nobody can hijack a recommendation.
- **Reports.** A real person reviews every report. Three reports from established
  members hide a post automatically until it's reviewed.
- **Money protections.** Earnings are held 45 days, clicking your own link earns
  nothing, duplicate sale notices are ignored, and removed posts or banned accounts
  **lose all unpaid earnings.**

### 4. Store rules: Amazon is off-limits
Amazon's Associates agreement forbids giving anyone "any consideration, reward, or
incentive" for using affiliate links, and bans rebate-style sites.

**In the prototype:** Amazon links still work as normal links but are **never** paid
links. Paid links only come from a partner-store list. Before launch, get written
approval from networks (Impact, Rakuten, CJ, Awin) or brands that allow a platform to
share commission with its members, like ShopMy does. Skimlinks-type services approve
only ~3% of applicants, so don't count on them early.

### 5. Thin money per sale
Commissions are usually 5–15%, higher in beauty and fashion. A $50 purchase at 8% is
$4, so the member gets $2.80 and Taste gets $1.20.
- **Start in high-commission categories**, such as beauty and skincare, then home.
- Taste's revenue only becomes large at scale. Plan for a **long runway** or outside
  investment.

### 6. Shopping apps fade
Polyvore had 20 million monthly users and still shut down in 2018. Research on
Wanelo and Fancy suggests shopping should feel *secondary* to the social part.

**In the prototype:** the app is about **people and honesty first.** You follow people,
mark posts "helpful", and say "I tried it too: agree or disagree." The money is a side
benefit.

## Other project-killers found in review, and the fixes

| Risk | Why it could kill Taste | Fix in the prototype |
|---|---|---|
| **Nobody earns steadily** | Posts fell out of Discover within days, so good recommenders would quit. | **Top picks**: all-time most helpful, per category, with no expiry. **Lists** ("My sensitive-skin routine") that stay useful for months. **Search** plus **public pages Google can index**, with a sitemap. |
| **The same few people get all the attention** | New members never get seen and give up. | Every 4th slot in Discover goes to a **Rising** post from a newer member. |
| **The site was invisible to outsiders** | Visitors had to log in to see anything, so there was no Google traffic and shared links hit a wall. | Discover, top picks, search, posts, profiles and lists are **public**. |
| **Nobody comes back** | No reason to return. | **Alerts** for new followers, helpful votes, "tried it too", approvals and earnings. A **weekly "This week on Taste"** digest of the most helpful members and picks. |
| **Empty at launch** | An empty app feels dead. | **Invite-only mode** with 5 invites each. New members **auto-follow the person who invited them**. The first 100 get a permanent **Founding member** badge. |
| **Can't launch without approvals** | Affiliate approval takes months and needs traffic first. | **Earnings switch**, off by default. Phase 1 runs with no money features at all. |
| **Fake-account vote rings** | Fake accounts upvote each other into the top. | Votes only count from **phone-verified accounts at least 3 days old**. |
| **Report brigading** | Competitors mass-report good posts to hide them. | People whose reports are mostly dismissed **lose the power to auto-hide**, and moderators see an "often reports wrongly" tag. |
| **Hidden brand promotion** | Owners secretly review their own products. That's an FTC violation and kills trust. | A **"I have a connection to this brand"** checkbox adds a visible label. Connected posts **can never earn**. "Undisclosed connection" is a report reason. |
| **Password guessing and signup floods** | Account takeovers and bot signups. | **Rate limits** on login and sign-up. |
| **No way to leave** | Breaks privacy laws (GDPR and California rules) and trust. | **Download my data** and **Delete my account** in Settings. Members can also delete their own posts. |
| **No terms or privacy policy** | Can't launch, and the app stores reject apps without them. | **Draft Terms and Privacy pages**, clearly marked for lawyer review, plus a sign-up checkbox. |
| **Phones** | Most users are on phones. | A **bottom tab bar** on mobile, like familiar social apps. |

## Running Taste from Canada

### Setting up the business
| Step | What | Notes |
|---|---|---|
| 1 | **Register the business** | Start as a sole proprietorship (cheap, simple) or incorporate. Federal incorporation through Corporations Canada costs about $200; provinces offer their own. A corporation keeps your personal assets separate, which matters once you pay members. |
| 2 | **Get a Business Number** from the CRA | Free. Needed for taxes, Stripe and affiliate networks. |
| 3 | **Open a business bank account** | Keep Taste's money separate from day one. |
| 4 | **GST/HST** | Registration is required once revenue passes **$30,000 in four consecutive quarters** (the "small supplier" rule). Commissions from US networks may be taxed differently; ask an accountant. |
| 5 | **CRA digital platform reporting** | Since 2024, platforms that help people earn money must report some sellers' income to the CRA. **Ask an accountant whether member commissions count.** Stripe Connect collects the tax details you'd need either way. |

### Laws that change how Taste works in Canada, and what the prototype does
| Law | What it means | In the prototype |
|---|---|---|
| **Competition Act**, plus Ad Standards guidelines | No fake or paid-for-positive reviews; brand connections must be disclosed; paid links clearly labeled | "Paid link" labels, a brand-connection label, verdict-neutral ranking, the honesty pledge |
| **CASL** (Canada's Anti-Spam Legislation) | Marketing emails need opt-in consent, sender details and an unsubscribe link. Referral messages have extra rules. | The weekly digest is **opt-in (unticked by default)**, consent time is recorded, and it can be turned off in Settings. **Taste never emails people on a member's behalf**: members share invite links themselves, which keeps referrals out of CASL. |
| **PIPEDA** (federal privacy) and **Quebec Law 25** | Consent, a named Privacy Officer, access and deletion rights, breach reporting | Draft privacy policy, data download, account deletion. You still need to **name a Privacy Officer**. |
| **Age of majority** | 18 in some provinces, 19 in others (BC, NS, NB, NL and the territories) | Sign-up asks for "the age of majority where I live." |
| **Quebec's French-language law (Bill 96)** | Businesses serving Quebec consumers need French versions of their website, terms and communications. Fines run $3,000–$30,000 a day. | **Not done yet.** Launch in an English-speaking city first and add French before marketing in Quebec. |

### Stores and money
- **Affiliate networks work in Canada:** Rakuten, CJ, Impact and Awin all have Canadian
  stores. The demo partner list now uses Canadian stores (Shoppers Drug Mart, Sephora,
  Well.ca, Best Buy Canada, Canadian Tire, Sport Chek, MEC, Indigo, Simons, Wayfair
  Canada). Each one must approve you and allow sharing commission with members.
- **Amazon.ca has the same ban** on rewarding people for links, so it's never a paid link.
- **Prices and payouts are in Canadian dollars.** Stripe Connect supports paying members
  in Canada.

## Launch plan

1. **Pick one niche in one English-speaking city** (French comes before Quebec):
   skincare for sensitive skin. It has high commissions, passionate
   people, and lots of bad products to warn about.
2. **Hand-pick 50–100 founding members** with real taste and launch with `INVITE_ONLY=1`.
   They get a permanent Founding member badge and 5 invites each.
3. **Copy Beli's growth tricks:** friend invites, weekly "most helpful" leaderboards,
   and campus or city competitions.
4. **Short videos** on TikTok and Reels: "Things our members told everyone to SKIP."
   Honest negatives get attention and build trust.
5. **Grow category by category** once the first one is lively.

## Still needed before a real public launch

- [ ] A Canadian lawyer to review the terms, privacy policy, earnings program and Competition Act compliance
- [ ] A Canadian accountant for GST/HST and CRA reporting (see "Running Taste from Canada")
- [ ] Affiliate network or brand approvals for commission sharing
- [ ] Real phone verification, e.g. Twilio Verify, which works with Canadian numbers
      (currently a demo button)
- [ ] Real identity checks and payouts through Stripe Connect, which is available in
      Canada (currently a demo button)
- [ ] A French version before marketing in Quebec
- [ ] A real database (Postgres) in place of the JSON file
- [ ] Photo uploads with image moderation
- [ ] Sending email: password reset and the weekly digest (the digest page exists; it needs an email provider)
- [ ] A dedicated moderator or two for launch week
- [ ] Final privacy policy and terms of service (drafts exist), plus a named Privacy Officer
- [ ] Mobile apps, after the web version proves people love it

## Sources

**Canada**
- [Competition Bureau warns about fake reviews (Norton Rose Fulbright)](https://www.nortonrosefulbright.com/en-ca/knowledge/publications/41049288/fake-reviews-competition-bureau-warns-businesses-of-stiff-penalties-associated-with-online-reviews)
- [Competition Bureau and influencer marketing (The Fashion Law)](https://www.thefashionlaw.com/canadas-competition-bureau-to-crack-down-on-influencer-marketing-as-spending-grows-to-nearly-2-billion/)
- [Ad Standards Influencer Marketing Disclosure Guidelines (Oct 2025)](https://adstandards.ca/wp-content/uploads/Ad-Standards-Influencer-Marketing-Disclosure-Guidelines-2025-10-08.pdf)
- [CRA: Reporting Rules for Digital Platform Operators](https://www.canada.ca/en/revenue-agency/programs/about-canada-revenue-agency-cra/compliance/reporting-rules-digital-platforms.html)
- [CRA tax tip for digital platform operators](https://www.canada.ca/en/revenue-agency/news/newsroom/tax-tips/tax-tips-2024/operating-digital-platform.html)
- [Bill 96 and June 1, 2025: common misconceptions (McCarthy Tétrault)](https://www.mccarthy.ca/en/insights/blogs/consumer-markets-perspectives/french-language-requirements-bill-96-and-june-1-2025-common-misconceptions)
- [Bill 96 key changes in 2025 (TransPerfect)](https://www.transperfect.com/blog/quebecs-bill-96-key-changes-2025)
- [Refresh your CASL knowledge (Canadian Marketing Association)](https://www.thecma.ca/topic/articles/2022/01/17/refresh-your-casl-knowledge)

**Market and US**

- [LTK vs ShopMy (2026)](https://stackinfluence.com/shopmy-vs-ltk-best-affiliate-platform-2026/)
- [ShopMy vs LTK commission ranges](https://gillian-sarah.com/shopmy-vs-ltk-2026/)
- [Influencer apps in 2026](https://nealschaffer.com/influencer-apps/)
- [Refer A Friend App launch](https://finance.yahoo.com/news/refer-friend-app-app-pays-140000198.html)
- [Shopcade: "Spam Friends, Earn Money" (TechCrunch, 2011)](https://techcrunch.com/2011/11/22/shopcade)
- [FTC final rule banning fake reviews](https://www.goodwinlaw.com/en/insights/publications/2024/09/alerts-practices-cldr-ftc-finalizes-rule-on-consumer-reviews)
- [FTC fake review rule: penalties](https://www.nutraingredients.com/Article/2024/08/16/ftc-announces-final-rule-banning-fake-reviews-and-testimonials)
- [FTC Endorsement Guides 2023: key takeaways](https://infolawgroup.com/insights/2023/7/31/ftc-releases-updated-endorsement-guides-10-key-takeaways)
- [Endorsement Guides in depth](https://www.mondaq.com/unitedstates/consumer-law/1349688/an-in-depth-look-at-the-ftcs-updates-to-the-endorsement-guidespart-2-of-2)
- [Amazon Associates: incentive prohibition](https://conductatlas.com/platform/amazon-associates/amazon-associates-program-policies/incentivized-clicks-and-purchases-prohibition/)
- [Skimlinks approvals process](https://skimlinks.com/?p=12208)
- [How Beli grew (Demand Curve)](https://www.demandcurve.com/newsletters/growth-newsletter-285)
- [Beli and dining out (Taste Cooking)](https://tastecooking.com/beli-invites-the-loneliest-generation-to-dine-out/)
- [What happened to Polyvore](https://productmint.com/what-happened-to-polyvore/)
- [Wanelo and social commerce (MediaPost)](https://www.mediapost.com/publications/article/229239/how-social-site-wanelo-wins-m-commerce-converts.html)

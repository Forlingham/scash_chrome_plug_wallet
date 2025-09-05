# SCASH Browser Extension Wallet

An open-source browser extension wallet for the **SCASH** community, built with **Next.js** and designed with security and usability in mind.  
This project is currently in active development and aims to bring a secure, user-friendly wallet experience to the SCASH ecosystem.


![SCASH Browser Extension Wallet](https://r2.scash.network/wallet_plug.png)
---

## ❤️ About the Project

This wallet is built out of passion and commitment to the SCASH community.  
I believe a strong ecosystem needs secure, transparent, and open-source tools that allow everyone to manage their assets without depending on third parties.  
The browser extension wallet is one step forward to making SCASH more accessible and trusted worldwide.

---

## 🔒 Security Principles

- **Non-custodial by design**:  
  Users control their private keys. Sensitive information (mnemonics, private keys) is **never transmitted over the network**.
  
- **Client-side signing**:  
  All transactions are signed locally in the front end. The backend (or RPC node) only broadcasts signed transactions and never has access to private keys.
  
- **Inspired by hardware wallets**:  
  Just like hardware wallets, signatures can be made without exposing secrets to external networks.

---

## 🛠️ Technology Stack

- **Next.js** — modern React framework for building the UI and extension logic.  
- **Frontend key management** — wallets are generated directly in the browser.  
- **Local signing** — all transactions are signed securely on the client side.  
- **Transaction broadcasting** — signed transactions are sent to the SCASH network via RPC or optional backend relay.

---

## 📌 Current Status

The wallet is **under active development**.  
At the current stage, we are still evaluating the technical architecture:

1. **Direct RPC Connection**  
   - Simpler design, but risks node overload under high traffic.  

2. **Backend Relay Service**  
   - Enables caching, load balancing, and better scaling.  

A decision will be made together with the community as development progresses.

---

## 🤝 Support Development

If you’d like to support ongoing development and show appreciation for this project, donations are welcome:  

**BTC**:  
`bc1qnvdrxs23t6ejuxjs6mswx7cez2rn80wrwjd0u8`  

**BNB**:  
`0xD4dB57B007Ad386C2fC4d7DD146f5977c039Fefc`  

**USDT (BEP-20)**:  
`0xD4dB57B007Ad386C2fC4d7DD146f5977c039Fefc`  

**SCASH**:  
`scash1qy48v7frkutlthqq7uqs8lk5fam24tghjdxqtf5`  

Your contributions help me keep building and innovating for the SCASH community. 🙏

---

## 📢 Links

- 🌐 Wallet Website (Web version): [https://wallet.scash.network/](https://wallet.scash.network/)  
- 📦 GitHub (Web Wallet): [https://github.com/Forlingham/scash_web_wallet_next.js](https://github.com/Forlingham/scash_web_wallet_next.js)  
- 🐦 Twitter: [https://x.com/Hysanalde](https://x.com/Hysanalde)

---

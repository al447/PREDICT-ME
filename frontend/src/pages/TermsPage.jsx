import Layout from '../components/layout/Layout';

const TermsPage = () => (
  <Layout>
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold text-[var(--color-text)] mb-8">Terms of Service</h1>
      <p className="text-[var(--color-text-muted)] mb-8">Last updated: June 12, 2026</p>

      <div className="space-y-8 text-[var(--color-text)]">
        <section>
          <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
          <p className="leading-relaxed">
            By accessing or using PredictMe ("Platform," "we," "our," or "us") at 
            <strong> https://predictme-live.vercel.app/</strong>, you agree to be bound by these Terms of Service. 
            If you do not agree to these terms, do not use our Platform.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">2. Eligibility</h2>
          <p className="leading-relaxed">You must be at least 18 years old to use our Platform. By using PredictMe, you represent and warrant that:</p>
          <ul className="list-disc pl-6 space-y-2 mt-2">
            <li>You are at least 18 years of age</li>
            <li>You have the legal capacity to enter into these Terms</li>
            <li>You are not located in a prohibited jurisdiction (see Section 12)</li>
            <li>You are not on any sanctions lists or prohibited from accessing financial services</li>
            <li>Your use of the Platform complies with all applicable laws and regulations</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">3. Non-Custodial Platform</h2>
          <p className="leading-relaxed">
            <strong>IMPORTANT:</strong> PredictMe is a <strong>non-custodial</strong> prediction market platform. 
            This means:
          </p>
          <ul className="list-disc pl-6 space-y-2 mt-2">
            <li><strong>You control your funds:</strong> We do not hold your cryptocurrencies or private keys</li>
            <li><strong>Your wallet:</strong> You receive a personal Gnosis Safe proxy wallet that only you control</li>
            <li><strong>No access:</strong> We cannot access, freeze, or move your funds under any circumstances</li>
            <li><strong>Your responsibility:</strong> You are solely responsible for securing your wallet credentials</li>
            <li><strong>On-chain settlement:</strong> All trades settle directly on the Polygon blockchain via audited smart contracts</li>
          </ul>
          <p className="leading-relaxed mt-4 text-[var(--color-warning)]">
            <strong>Warning:</strong> If you lose access to your wallet, we cannot recover your funds. 
            Keep your recovery credentials secure.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">4. Prediction Markets and Trading Risks</h2>
          <p className="leading-relaxed">
            Prediction markets involve substantial risk. By using our Platform, you acknowledge:
          </p>
          <ul className="list-disc pl-6 space-y-2 mt-2">
            <li><strong>Financial risk:</strong> You may lose all funds deposited for trading</li>
            <li><strong>Market volatility:</strong> Position values can change rapidly based on market sentiment</li>
            <li><strong>Resolution risk:</strong> Market outcomes are determined by oracles and external data sources</li>
            <li><strong>Smart contract risk:</strong> Despite audits, smart contracts may contain vulnerabilities</li>
            <li><strong>Blockchain risk:</strong> Network congestion, high gas fees, or chain reorganizations may affect transactions</li>
            <li><strong>No guarantees:</strong> We do not guarantee profits, accurate predictions, or successful trades</li>
          </ul>
          <p className="leading-relaxed mt-4">
            <strong>Never trade with funds you cannot afford to lose.</strong>
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">5. MoonPay Fiat On-Ramp</h2>
          <p className="leading-relaxed">
            When purchasing cryptocurrency with fiat currency through MoonPay:
          </p>
          <ul className="list-disc pl-6 space-y-2 mt-2">
            <li>MoonPay is an independent third-party service provider</li>
            <li>You agree to MoonPay's separate <a href="https://www.moonpay.com/legal/terms_of_use" target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] hover:underline">Terms of Use</a></li>
            <li>MoonPay handles all KYC/AML verification and compliance</li>
            <li>Purchased USDC is sent directly to your personal wallet address</li>
            <li>MoonPay fees are disclosed before transaction confirmation</li>
            <li>We are not responsible for MoonPay service availability or disputes</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">6. Prohibited Activities</h2>
          <p className="leading-relaxed">You agree not to:</p>
          <ul className="list-disc pl-6 space-y-2 mt-2">
            <li>Manipulate markets, create fake volume, or engage in wash trading</li>
            <li>Use insider information to trade on outcomes you can influence</li>
            <li>Create markets about illegal activities, violence, or harm to individuals</li>
            <li>Create markets about terrorist activities, child exploitation, or hate speech</li>
            <li>Use the Platform for money laundering, sanctions evasion, or other illegal purposes</li>
            <li>Attempt to hack, exploit, or attack our smart contracts or infrastructure</li>
            <li>Impersonate others or provide false information</li>
            <li>Use bots or automated systems to gain unfair advantages (unless authorized market makers)</li>
            <li>Circumvent our security measures or rate limits</li>
          </ul>
          <p className="leading-relaxed mt-4">
            Violation may result in account termination and legal action.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">7. Intellectual Property</h2>
          <p className="leading-relaxed">
            All content on the Platform, including software, text, graphics, logos, and designs, is owned by 
            PredictMe or our licensors and protected by intellectual property laws. You may not copy, 
            modify, distribute, or create derivative works without our written permission.
          </p>
          <p className="leading-relaxed mt-4">
            Our smart contracts are open-source and available under their respective licenses. 
            Third-party contracts (Polymarket, Gnosis) remain under their original licenses.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">8. Disclaimer of Warranties</h2>
          <p className="leading-relaxed">
            THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, 
            EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO:
          </p>
          <ul className="list-disc pl-6 space-y-2 mt-2">
            <li>Merchantability, fitness for a particular purpose, or non-infringement</li>
            <li>Accuracy, reliability, or completeness of market data</li>
            <li>Security or uninterrupted availability of the Platform</li>
            <li>Profitable trading outcomes or correct market resolutions</li>
          </ul>
          <p className="leading-relaxed mt-4">
            Blockchain transactions are irreversible. We are not responsible for losses due to user error, 
            network issues, or smart contract bugs.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">9. Limitation of Liability</h2>
          <p className="leading-relaxed">
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, PREDICTME AND ITS AFFILIATES, OFFICERS, EMPLOYEES, 
            AGENTS, AND LICENSORS SHALL NOT BE LIABLE FOR:
          </p>
          <ul className="list-disc pl-6 space-y-2 mt-2">
            <li>Any direct, indirect, incidental, special, consequential, or punitive damages</li>
            <li>Lost profits, lost revenue, lost savings, or business interruption</li>
            <li>Loss of cryptocurrencies, trading positions, or wallet access</li>
            <li>Damages arising from smart contract bugs, oracle failures, or blockchain issues</li>
            <li>Damages exceeding the amount you paid to use the Platform in the preceding 12 months</li>
          </ul>
          <p className="leading-relaxed mt-4">
            This limitation applies regardless of the legal theory (contract, tort, strict liability, etc.) 
            even if we were advised of the possibility of such damages.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">10. Indemnification</h2>
          <p className="leading-relaxed">
            You agree to indemnify, defend, and hold harmless PredictMe and our affiliates from any claims, 
            damages, losses, liabilities, costs, or expenses (including attorneys' fees) arising from:
          </p>
          <ul className="list-disc pl-6 space-y-2 mt-2">
            <li>Your use of the Platform</li>
            <li>Your violation of these Terms</li>
            <li>Your violation of any third-party rights</li>
            <li>Your trading activities or market outcomes</li>
            <li>Any content you submit to the Platform</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">11. Prohibited Jurisdictions</h2>
          <p className="leading-relaxed">
            The Platform is not available to residents of:
          </p>
          <ul className="list-disc pl-6 space-y-2 mt-2">
            <li>United States (due to CFTC regulations on event-based markets)</li>
            <li>Canada (provincial restrictions)</li>
            <li>United Kingdom (FCA restrictions)</li>
            <li>Singapore (MAS restrictions)</li>
            <li>Any jurisdiction where prediction markets are prohibited</li>
            <li>Any sanctioned countries or territories</li>
          </ul>
          <p className="leading-relaxed mt-4">
            By using the Platform, you represent that you are not a resident of these jurisdictions. 
            We reserve the right to restrict access from any jurisdiction at our discretion.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">12. Modification of Terms</h2>
          <p className="leading-relaxed">
            We may modify these Terms at any time. Changes will be effective immediately upon posting 
            to the Platform. Your continued use after changes constitutes acceptance. Material changes 
            will be notified via email or platform announcement.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">13. Termination</h2>
          <p className="leading-relaxed">
            We may suspend or terminate your access to the Platform at any time, with or without cause, 
            and with or without notice. Upon termination:
          </p>
          <ul className="list-disc pl-6 space-y-2 mt-2">
            <li>Your right to use the Platform immediately ceases</li>
            <li>Your funds remain in your personal wallet (we cannot access them)</li>
            <li>Provisions that by their nature should survive termination will survive</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">14. Governing Law and Dispute Resolution</h2>
          <p className="leading-relaxed">
            These Terms are governed by the laws of [Jurisdiction - specify your legal entity location]. 
            Any disputes shall be resolved through:
          </p>
          <ul className="list-disc pl-6 space-y-2 mt-2">
            <li>Good faith negotiation between parties</li>
            <li>Binding arbitration if negotiation fails</li>
            <li>No class action lawsuits permitted</li>
          </ul>
          <p className="leading-relaxed mt-4">
            <strong>Note:</strong> You waive any right to a jury trial or to participate in class actions.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">15. Severability</h2>
          <p className="leading-relaxed">
            If any provision of these Terms is found invalid or unenforceable, the remaining provisions 
            will continue in full force and effect. The invalid provision will be modified to the minimum 
            extent necessary to make it valid and enforceable.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">16. Entire Agreement</h2>
          <p className="leading-relaxed">
            These Terms, together with our Privacy Policy, constitute the entire agreement between you 
            and PredictMe regarding the Platform, superseding any prior agreements.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">17. Waiver</h2>
          <p className="leading-relaxed">
            Our failure to enforce any right or provision of these Terms does not constitute a waiver. 
            Any waiver must be in writing and signed by an authorized representative.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">18. Assignment</h2>
          <p className="leading-relaxed">
            You may not assign or transfer these Terms without our prior written consent. We may assign 
            these Terms freely in connection with a merger, acquisition, or sale of assets.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">19. Force Majeure</h2>
          <p className="leading-relaxed">
            We are not liable for any failure or delay due to causes beyond our reasonable control, 
            including acts of God, war, terrorism, riots, embargoes, acts of civil or military authorities, 
            fire, floods, accidents, strikes, or shortages of transportation, facilities, fuel, energy, 
            labor, or materials. This includes blockchain network failures or oracle service outages.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">20. Contact Information</h2>
          <p className="leading-relaxed">
            For questions about these Terms, contact us:
          </p>
          <p className="mt-4">
            <strong>Email:</strong> support@predictme.com<br />
            <strong>Platform:</strong> https://predictme-live.vercel.app/
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">21. Acknowledgment</h2>
          <p className="leading-relaxed">
            BY USING PREDICTME, YOU ACKNOWLEDGE THAT YOU HAVE READ, UNDERSTOOD, AND AGREE TO BE BOUND BY 
            THESE TERMS OF SERVICE. YOU FURTHER ACKNOWLEDGE THAT YOU UNDERSTAND THE RISKS ASSOCIATED WITH 
            PREDICTION MARKETS, CRYPTOCURRENCY TRADING, AND NON-CUSTODIAL WALLETS.
          </p>
        </section>
      </div>
    </div>
  </Layout>
);

export default TermsPage;

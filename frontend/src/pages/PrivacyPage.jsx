import Layout from '../components/layout/Layout';

const PrivacyPage = () => (
  <Layout>
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold text-[var(--color-text)] mb-8">Privacy Policy</h1>
      <p className="text-[var(--color-text-muted)] mb-8">Last updated: June 12, 2026</p>

      <div className="space-y-8 text-[var(--color-text)]">
        <section>
          <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
          <p className="leading-relaxed">
            PredictMe ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy 
            explains how we collect, use, disclose, and safeguard your information when you use our 
            prediction market platform at <strong>https://predictme-live.vercel.app/</strong>.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">2. Information We Collect</h2>
          <h3 className="text-xl font-medium mb-2 mt-4">2.1 Personal Information</h3>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Email address:</strong> Collected when you register or authenticate via Magic.link</li>
            <li><strong>Wallet address:</strong> Your blockchain wallet address for non-custodial wallet creation</li>
            <li><strong>Profile information:</strong> Optional display name, avatar</li>
          </ul>

          <h3 className="text-xl font-medium mb-2 mt-6">2.2 Usage Information</h3>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Trading history:</strong> Orders placed, positions held, markets participated in</li>
            <li><strong>Transaction data:</strong> Deposits, withdrawals, on-chain interactions</li>
            <li><strong>Device information:</strong> IP address, browser type, operating system</li>
            <li><strong>Log data:</strong> Access times, pages viewed, features used</li>
          </ul>

          <h3 className="text-xl font-medium mb-2 mt-6">2.3 Information We Do NOT Collect</h3>
          <p className="leading-relaxed">
            <strong>Important:</strong> PredictMe is a <strong>non-custodial</strong> platform. We do not:
          </p>
          <ul className="list-disc pl-6 space-y-2 mt-2">
            <li>Store your private keys or seed phrases</li>
            <li>Hold your funds or cryptocurrencies</li>
            <li>Have access to your Gnosis Safe proxy wallet</li>
            <li>Collect KYC information (handled separately by MoonPay for fiat on-ramps)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">3. How We Use Your Information</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Platform operation:</strong> To provide prediction market trading services</li>
            <li><strong>Authentication:</strong> To verify your identity and secure your account</li>
            <li><strong>Trading functionality:</strong> To execute orders, track positions, settle markets</li>
            <li><strong>Communications:</strong> To send notifications about your trades, market resolutions</li>
            <li><strong>Platform improvement:</strong> To analyze usage and improve our services</li>
            <li><strong>Legal compliance:</strong> To comply with applicable laws and regulations</li>
            <li><strong>Security:</strong> To detect and prevent fraud, abuse, and security incidents</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">4. MoonPay Integration (Fiat On-Ramp)</h2>
          <p className="leading-relaxed">
            When you purchase cryptocurrency using fiat currency through MoonPay:
          </p>
          <ul className="list-disc pl-6 space-y-2 mt-2">
            <li>MoonPay handles all KYC/AML verification independently</li>
            <li>We do not receive or store your government ID, address proof, or financial documents</li>
            <li>MoonPay sends purchased USDC directly to your personal wallet address</li>
            <li>Your KYC data remains with MoonPay under their privacy policy</li>
          </ul>
          <p className="leading-relaxed mt-4">
            Please review <a href="https://www.moonpay.com/legal/privacy_policy" target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] hover:underline">MoonPay's Privacy Policy</a> for details on their data practices.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">5. Non-Custodial Architecture</h2>
          <p className="leading-relaxed">
            PredictMe uses a non-custodial architecture:
          </p>
          <ul className="list-disc pl-6 space-y-2 mt-2">
            <li>Each user receives their own Gnosis Safe proxy wallet (created via CREATE2)</li>
            <li>Your private keys are managed by Magic.link or your own wallet provider</li>
            <li>We cannot access, move, or freeze your funds</li>
            <li>All trades settle on-chain via Polymarket's audited smart contracts</li>
            <li>You maintain full control of your assets at all times</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">6. Information Sharing</h2>
          <p className="leading-relaxed">We may share information with:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Service providers:</strong> Magic.link (authentication), Goldsky (indexing), hosting providers</li>
            <li><strong>Blockchain networks:</strong> Transaction data is publicly visible on Polygon</li>
            <li><strong>Legal authorities:</strong> When required by law, court order, or to protect our rights</li>
            <li><strong>Business transfers:</strong> In connection with a merger, acquisition, or sale</li>
          </ul>
          <p className="leading-relaxed mt-4">
            We do not sell your personal information to third parties.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">7. Data Security</h2>
          <p className="leading-relaxed">
            We implement appropriate technical and organizational measures:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>TLS encryption for all data transmission</li>
            <li>Encrypted database storage (MongoDB Atlas)</li>
            <li>Access controls and authentication requirements</li>
            <li>Regular security assessments</li>
            <li>Rate limiting to prevent abuse</li>
          </ul>
          <p className="leading-relaxed mt-4">
            However, no internet transmission is 100% secure. You use our platform at your own risk.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">8. Data Retention</h2>
          <p className="leading-relaxed">
            We retain your information as long as necessary to:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Provide our services</li>
            <li>Comply with legal obligations</li>
            <li>Resolve disputes</li>
            <li>Enforce our agreements</li>
          </ul>
          <p className="leading-relaxed mt-4">
            On-chain transaction data cannot be deleted as it is permanently recorded on the blockchain.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">9. Your Rights</h2>
          <p className="leading-relaxed">Depending on your location, you may have the right to:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Access:</strong> Request a copy of your personal information</li>
            <li><strong>Correction:</strong> Request correction of inaccurate information</li>
            <li><strong>Deletion:</strong> Request deletion of your account and personal data</li>
            <li><strong>Portability:</strong> Request transfer of your data</li>
            <li><strong>Restriction:</strong> Request limitation of processing</li>
            <li><strong>Objection:</strong> Object to certain processing activities</li>
          </ul>
          <p className="leading-relaxed mt-4">
            To exercise these rights, contact us at <strong>support@predictme.com</strong>.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">10. International Data Transfers</h2>
          <p className="leading-relaxed">
            Your information may be transferred to and processed in countries other than your country 
            of residence. These countries may have different data protection laws. We ensure appropriate 
            safeguards are in place for such transfers.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">11. Children's Privacy</h2>
          <p className="leading-relaxed">
            Our platform is not intended for individuals under 18 years of age. We do not knowingly 
            collect personal information from children. If you believe we have collected information 
            from a child, please contact us immediately.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">12. Changes to This Policy</h2>
          <p className="leading-relaxed">
            We may update this Privacy Policy from time to time. We will notify you of any material 
            changes by posting the new policy on this page and updating the "Last updated" date. 
            Your continued use of the platform after changes constitutes acceptance.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-semibold mb-4">13. Contact Us</h2>
          <p className="leading-relaxed">
            If you have questions about this Privacy Policy or our data practices, contact us at:
          </p>
          <p className="mt-4">
            <strong>Email:</strong> support@predictme.com<br />
            <strong>Platform:</strong> https://predictme-live.vercel.app/
          </p>
        </section>
      </div>
    </div>
  </Layout>
);

export default PrivacyPage;

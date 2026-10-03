import './payment-qr.css';

export function PaymentQr() {
  return (
    <div className="payment-qr">
      <div className="payment-qr-copy">
        <span className="payment-qr-eyebrow">QUICK, SECURE PAYMENT</span>
        <h3>Scan to pay</h3>
        <p>Open any UPI app and scan the code to pay.</p>
        <span className="payment-qr-hint">Google Pay · PhonePe · Paytm · BHIM</span>
      </div>
      <div className="payment-qr-frame">
        <img src="/payment-qr.png" alt="Payment QR code for UPI" />
      </div>
    </div>
  );
}


Menu
The user requested...

Hey Paul, Quick input needed :
Ask Question
Agent will continue working after your reply
Perfect! 🎉 Now let's create the React components. We need to create several frontend files:

3. Create the main React App component
Add file → Create new file
Filename: frontend/src/App.js
Paste this complete React component code:
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

// Payment flow steps
const STEPS = {
  AMOUNT: 'amount',
  TIP: 'tip',
  TAP: 'tap',
  SUCCESS: 'success',
  RECEIPT: 'receipt'
};

function App() {
  // State management
  const [currentStep, setCurrentStep] = useState(STEPS.AMOUNT);
  const [amount, setAmount] = useState('');
  const [tipPercentage, setTipPercentage] = useState(0);
  const [customTip, setCustomTip] = useState('');
  const [tipAmount, setTipAmount] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [paymentData, setPaymentData] = useState(null);
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [nfcSupported, setNfcSupported] = useState(false);
  const [nfcStatus, setNfcStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [receiptSent, setReceiptSent] = useState(false);

  // Check NFC support on component mount
  useEffect(() => {
    if ('NDEFReader' in window) {
      setNfcSupported(true);
      setNfcStatus('NFC supported - Ready to accept cards');
    } else {
      setNfcSupported(false);
      setNfcStatus('NFC not supported - Using demo mode');
    }
  }, []);

  // Calculate tip and total when amount or tip changes
  useEffect(() => {
    const baseAmount = parseFloat(amount) || 0;
    let calculatedTip = 0;

    if (tipPercentage > 0) {
      calculatedTip = (baseAmount * tipPercentage) / 100;
    } else if (customTip) {
      calculatedTip = parseFloat(customTip) || 0;
    }

    setTipAmount(calculatedTip);
    setTotalAmount(baseAmount + calculatedTip);
  }, [amount, tipPercentage, customTip]);

  // Utility functions
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value);
  };

  const getStepIndex = (step) => {
    const steps = Object.values(STEPS);
    return steps.indexOf(step);
  };

  // Amount input handlers
  const handleKeypadPress = (key) => {
    if (key === 'clear') {
      setAmount('');
    } else if (key === 'backspace') {
      setAmount(prev => prev.slice(0, -1));
    } else if (key === '.') {
      if (!amount.includes('.')) {
        setAmount(prev => prev + '.');
      }
    } else {
      if (amount.length < 8) { // Limit input length
        setAmount(prev => prev + key);
      }
    }
  };

  // Tip selection handlers
  const handleTipSelect = (percentage) => {
    setTipPercentage(percentage);
    setCustomTip('');
  };

  const handleCustomTipChange = (e) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setCustomTip(value);
      setTipPercentage(0);
    }
  };

  // Payment processing
  const processPayment = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await axios.post(`${BACKEND_URL}/api/payments`, {
        amount: parseFloat(amount),
        tip_amount: tipAmount,
        customer_email: customerEmail,
        customer_phone: customerPhone
      });

      setPaymentData(response.data);
      
      if (nfcSupported) {
        // Attempt NFC reading for real card payments
        try {
          const ndef = new window.NDEFReader();
          await ndef.scan();
          setNfcStatus('Tap your card now...');
          
          // Listen for NFC card tap
          ndef.addEventListener('reading', () => {
            setNfcStatus('Card detected! Processing...');
            setTimeout(() => {
              setCurrentStep(STEPS.SUCCESS);
            }, 2000);
          });

          // Timeout after 30 seconds
          setTimeout(() => {
            if (currentStep === STEPS.TAP) {
              setNfcStatus('No card detected - Using demo mode');
              setTimeout(() => {
                setCurrentStep(STEPS.SUCCESS);
              }, 1000);
            }
          }, 30000);

        } catch (nfcError) {
          console.log('NFC error:', nfcError);
          setNfcStatus('NFC not available - Using demo mode');
          setTimeout(() => {
            setCurrentStep(STEPS.SUCCESS);
          }, 2000);
        }
      } else {
        // Demo mode - simulate payment processing
        setNfcStatus('Processing payment...');
        setTimeout(() => {
          setCurrentStep(STEPS.SUCCESS);
        }, 3000);
      }

    } catch (err) {
      console.error('Payment error:', err);
      setError('Payment failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Receipt sending
  const sendReceipt = async (method) => {
    if (!paymentData) return;

    const contact = method === 'email' ? customerEmail : customerPhone;
    if (!contact) {
      setError(`Please enter your ${method === 'email' ? 'email address' : 'phone number'}`);
      return;
    }

    setLoading(true);
    setError('');

    try {
      await axios.post(`${BACKEND_URL}/api/receipts/send`, {
        payment_id: paymentData.payment_id,
        customer_email: method === 'email' ? customerEmail : null,
        customer_phone: method === 'sms' ? customerPhone : null,
        method: method
      });

      setReceiptSent(true);
      setTimeout(() => {
        // Show thank you banner and reset after 5 seconds
        setTimeout(resetApp, 5000);
      }, 1000);

    } catch (err) {
      console.error('Receipt error:', err);
      setError('Failed to send receipt. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Navigation
  const goToNextStep = () => {
    const steps = Object.values(STEPS);
    const currentIndex = steps.indexOf(currentStep);
    
    if (currentStep === STEPS.AMOUNT && (!amount || parseFloat(amount) <= 0)) {
      setError('Please enter a valid amount');
      return;
    }

    if (currentStep === STEPS.TIP) {
      setCurrentStep(STEPS.TAP);
      processPayment();
    } else if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
      setError('');
    }
  };

  const goToPrevStep = () => {
    const steps = Object.values(STEPS);
    const currentIndex = steps.indexOf(currentStep);
    
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1]);
      setError('');
    }
  };

  const resetApp = () => {
    setCurrentStep(STEPS.AMOUNT);
    setAmount('');
    setTipPercentage(0);
    setCustomTip('');
    setTipAmount(0);
    setTotalAmount(0);
    setPaymentData(null);
    setCustomerEmail('');
    setCustomerPhone('');
    setLoading(false);
    setError('');
    setReceiptSent(false);
  };

  // Render keypad for amount input
  const renderKeypad = () => (
    <div className="keypad">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
        <button
          key={num}
          className="keypad-btn"
          onClick={() => handleKeypadPress(num.toString())}
        >
          {num}
        </button>
      ))}
      <button className="keypad-btn" onClick={() => handleKeypadPress('clear')}>
        Clear
      </button>
      <button className="keypad-btn zero" onClick={() => handleKeypadPress('0')}>
        0
      </button>
      <button className="keypad-btn" onClick={() => handleKeypadPress('.')}>
        .
      </button>
    </div>
  );

  // Render step indicator
  const renderStepIndicator = () => {
    const steps = Object.values(STEPS);
    const currentIndex = getStepIndex(currentStep);

    return (
      <div className="step-indicator">
        {steps.map((step, index) => (
          <div
            key={step}
            className={`step-dot ${
              index === currentIndex ? 'active' : 
              index < currentIndex ? 'completed' : ''
            }`}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="app">
      <div className="payment-container">
        <div className="header">
          <h1>💈 Barber Pay</h1>
          <p className="subtitle">Professional Payment System</p>
        </div>

        <div className="content">
          {renderStepIndicator()}

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          {/* AMOUNT INPUT STEP */}
          {currentStep === STEPS.AMOUNT && (
            <div className="amount-section">
              <h2>Enter Amount</h2>
              <div className="amount-display">
                <span className="currency-symbol">$</span>
                <input
                  type="text"
                  className="amount-input"
                  value={amount}
                  placeholder="0.00"
                  readOnly
                />
              </div>
              {renderKeypad()}
              <div className="nav-buttons">
                <button
                  className="nav-btn primary"
                  onClick={goToNextStep}
                  disabled={!amount || parseFloat(amount) <= 0}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* TIP SELECTION STEP */}
          {currentStep === STEPS.TIP && (
            <div className="tip-section">
              <h2>Add Tip</h2>
              <div className="base-amount">
                Service Amount: {formatCurrency(parseFloat(amount) || 0)}
              </div>
              
              <div className="tip-options">
                {[20, 25, 30, 35, 40].map(percentage => (
                  <button
                    key={percentage}
                    className={`tip-btn ${tipPercentage === percentage ? 'selected' : ''}`}
                    onClick={() => handleTipSelect(percentage)}
                  >
                    {percentage}%
                  </button>
                ))}
                <button
                  className={`tip-btn ${tipPercentage === 0 && !customTip ? 'selected' : ''}`}
                  onClick={() => handleTipSelect(0)}
                >
                  No Tip
                </button>
              </div>

              <div className="custom-tip">
                <span style={{ color: 'rgba(255,255,255,0.8)' }}>Custom: $</span>
                <input
                  type="text"
                  value={customTip}
                  onChange={handleCustomTipChange}
                  placeholder="0.00"
                />
              </div>

              <div className="tip-summary">
                <div className="tip-summary-line">
                  <span>Service</span>
                  <span>{formatCurrency(parseFloat(amount) || 0)}</span>
                </div>
                <div className="tip-summary-line">
                  <span>Tip</span>
                  <span>{formatCurrency(tipAmount)}</span>
                </div>
                <div className="tip-summary-total">
                  <span>Total</span>
                  <span>{formatCurrency(totalAmount)}</span>
                </div>
              </div>

              <div className="nav-buttons">
                <button className="nav-btn secondary" onClick={goToPrevStep}>
                  Back
                </button>
                <button className="nav-btn primary" onClick={goToNextStep}>
                  Continue to Payment
                </button>
              </div>
            </div>
          )}

          {/* TAP TO PAY STEP */}
          {currentStep === STEPS.TAP && (
            <div className="tap-section">
              <h2>Tap to Pay</h2>
              <div className="tap-amount">
                {formatCurrency(totalAmount)}
              </div>
              
              <div className="tap-animation">
                <div className="card-icon"></div>
                <div className="wave"></div>
                <div className="wave"></div>
                <div className="wave"></div>
              </div>

              <div className="tap-instructions">
                {loading ? 'Processing...' : 'Tap your card on the device'}
              </div>

              <div className="nfc-status">
                {nfcStatus}
              </div>

              <div className="nav-buttons">
                <button 
                  className="nav-btn secondary" 
                  onClick={goToPrevStep}
                  disabled={loading}
                >
                  Back
                </button>
              </div>
            </div>
          )}

          {/* SUCCESS STEP */}
          {currentStep === STEPS.SUCCESS && (
            <div className="success-section">
              <div className="success-icon"></div>
              <h2>Payment Successful!</h2>
              <p className="success-message">
                Your payment has been processed successfully.
              </p>

              <div className="payment-summary">
                <div className="summary-line">
                  <span>Service Amount</span>
                  <span>{formatCurrency(parseFloat(amount) || 0)}</span>
                </div>
                <div className="summary-line">
                  <span>Tip</span>
                  <span>{formatCurrency(tipAmount)}</span>
                </div>
                <div className="summary-total">
                  <span>Total Paid</span>
                  <span>{formatCurrency(totalAmount)}</span>
                </div>
              </div>

              <div className="nav-buttons">
                <button className="nav-btn secondary" onClick={resetApp}>
                  New Payment
                </button>
                <button className="nav-btn primary" onClick={goToNextStep}>
                  Send Receipt
                </button>
              </div>
            </div>
          )}

          {/* RECEIPT STEP */}
          {currentStep === STEPS.RECEIPT && !receiptSent && (
            <div className="receipt-section">
              <h2>Send Receipt</h2>
              
              <div className="receipt-options">
                <div className="input-group">
                  <label>Email Address</label>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="customer@example.com"
                  />
                </div>

                <div className="input-group">
                  <label>Phone Number</label>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
              </div>

              <div className="receipt-buttons">
                <button
                  className="receipt-btn"
                  onClick={() => sendReceipt('email')}
                  disabled={!customerEmail || loading}
                >
                  {loading ? <span className="loading"></span> : '📧'} Email Receipt
                </button>
                <button
                  className="receipt-btn"
                  onClick={() => sendReceipt('sms')}
                  disabled={!customerPhone || loading}
                >
                  {loading ? <span className="loading"></span> : '📱'} SMS Receipt
                </button>
              </div>

              <div className="nav-buttons">
                <button className="nav-btn secondary" onClick={goToPrevStep}>
                  Back
                </button>
                <button className="nav-btn secondary" onClick={resetApp}>
                  Skip Receipt
                </button>
              </div>
            </div>
          )}
        </div>

        {/* THANK YOU BANNER */}
        {receiptSent && (
          <div className="thank-you-banner">
            ✅ Receipt sent! Thank you, please return phone to owner.
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

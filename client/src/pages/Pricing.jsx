import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import PricingCard from '../components/PricingCard';
import Footer from '../components/Footer';

export default function Pricing() {
  const [plans, setPlans] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processingPlan, setProcessingPlan] = useState(null);
  const { user, subscription, isSubscribed, refreshUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchPlans();
    loadRazorpayScript();
  }, []);

  const fetchPlans = async () => {
    try {
      const response = await fetch('/api/payments/plans');
      if (response.ok) {
        const data = await response.json();
        setPlans(data.plans);
      }
    } catch {
      console.error('Failed to fetch plans');
    } finally {
      setLoading(false);
    }
  };

  const loadRazorpayScript = () => {
    if (document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]')) {
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
  };

  const handleSubscribe = async (planKey) => {
    if (!user) {
      navigate('/register');
      return;
    }

    setProcessingPlan(planKey);

    try {
      // Create order
      const orderResponse = await api('/payments/create-order', {
        method: 'POST',
        body: JSON.stringify({ plan: planKey }),
      });

      if (!orderResponse.ok) {
        const err = await orderResponse.json();
        alert(err.error || 'Failed to create order');
        return;
      }

      const orderData = await orderResponse.json();

      // Open Razorpay checkout
      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'StreamVault',
        description: orderData.description,
        order_id: orderData.orderId,
        handler: async function (response) {
          // Verify payment
          try {
            const verifyResponse = await api('/payments/verify', {
              method: 'POST',
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });

            if (verifyResponse.ok) {
              await refreshUser();
              navigate('/browse');
            } else {
              alert('Payment verification failed. Please contact support.');
            }
          } catch {
            alert('Payment verification failed. Please contact support.');
          }
        },
        prefill: {
          email: user.email,
          name: user.name,
        },
        theme: {
          color: '#8b5cf6',
        },
        modal: {
          ondismiss: () => {
            setProcessingPlan(null);
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      alert('Something went wrong. Please try again.');
    } finally {
      setProcessingPlan(null);
    }
  };

  if (loading) {
    return (
      <div className="page loading-page">
        <div className="spinner"></div>
        <p>Loading plans...</p>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="page-section">
        <div className="container">
          <div className="section-header" style={{ textAlign: 'center' }}>
            <h1 className="section-title">Choose Your Plan</h1>
            <p className="section-subtitle" style={{ margin: '0 auto' }}>
              {isSubscribed
                ? 'You have an active subscription. Upgrade or extend anytime.'
                : 'Unlock unlimited access to all premium content'}
            </p>
          </div>

          {isSubscribed && subscription && (
            <div className="card" style={{
              maxWidth: '500px',
              margin: '0 auto var(--space-10)',
              textAlign: 'center',
              background: 'rgba(34, 197, 94, 0.05)',
              borderColor: 'rgba(34, 197, 94, 0.2)',
            }}>
              <span className="badge badge-success" style={{ marginBottom: 'var(--space-3)' }}>
                Active Subscription
              </span>
              <h3 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-2)' }}>
                {subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)} Plan
              </h3>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                Expires: {new Date(subscription.expires_at).toLocaleDateString('en-IN', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          )}

          {plans && (
            <div className="pricing-grid">
              <PricingCard
                plan={plans.weekly}
                planKey="weekly"
                onSubscribe={handleSubscribe}
                loading={processingPlan === 'weekly'}
                currentPlan={isSubscribed ? subscription?.plan : null}
              />
              <PricingCard
                plan={plans.monthly}
                planKey="monthly"
                featured
                onSubscribe={handleSubscribe}
                loading={processingPlan === 'monthly'}
                currentPlan={isSubscribed ? subscription?.plan : null}
              />
              <PricingCard
                plan={plans.yearly}
                planKey="yearly"
                onSubscribe={handleSubscribe}
                loading={processingPlan === 'yearly'}
                currentPlan={isSubscribed ? subscription?.plan : null}
              />
            </div>
          )}

          <p style={{
            textAlign: 'center',
            marginTop: 'var(--space-8)',
            color: 'var(--color-text-muted)',
            fontSize: 'var(--font-size-sm)',
          }}>
            Payments secured by Razorpay. Cancel anytime.
          </p>
        </div>
      </section>
      <Footer />
    </div>
  );
}

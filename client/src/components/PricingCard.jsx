import { formatPrice } from '../utils/api';

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const features = [
  'Unlimited video streaming',
  'HD quality playback',
  'Access all exclusive content',
  'Stream on any device',
  'Cancel anytime',
];

export default function PricingCard({ plan, planKey, featured, onSubscribe, loading, currentPlan }) {
  const isCurrentPlan = currentPlan === planKey;
  const periodLabel = planKey === 'weekly' ? '/week' : planKey === 'monthly' ? '/month' : '/year';

  return (
    <div className={`pricing-card ${featured ? 'featured' : ''}`}>
      {featured && <div className="pricing-card-badge">Most Popular</div>}
      <div className="pricing-card-plan">{plan.name}</div>
      <div className="pricing-card-price">
        {formatPrice(plan.amount)}
        <span>{periodLabel}</span>
      </div>
      <div className="pricing-card-desc">{plan.description}</div>
      <div className="pricing-card-features">
        {features.map((feature, i) => (
          <div key={i} className="pricing-card-feature">
            <CheckIcon />
            <span>{feature}</span>
          </div>
        ))}
      </div>
      {isCurrentPlan ? (
        <button className="btn btn-secondary btn-full" disabled>
          Current Plan
        </button>
      ) : (
        <button
          className={`btn ${featured ? 'btn-primary' : 'btn-secondary'} btn-full`}
          onClick={() => onSubscribe(planKey)}
          disabled={loading}
        >
          {loading ? 'Processing...' : `Subscribe ${plan.name}`}
        </button>
      )}
    </div>
  );
}

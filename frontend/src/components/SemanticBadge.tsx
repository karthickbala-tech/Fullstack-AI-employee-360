import React from 'react';
import type { ConfidenceLevel, DataClassification } from '../types/employee360';

interface SemanticBadgeProps {
  classification: DataClassification;
  size?: 'sm' | 'md';
}

export const SemanticBadge: React.FC<SemanticBadgeProps> = ({
  classification,
  size = 'sm',
}) => {
  const normalized = classification || 'Unknown';

  const getVariantClass = (cls: DataClassification): string => {
    switch (cls) {
      case 'Fact':
        return 'sem-tag sem-fact';
      case 'Calculation':
        return 'sem-tag sem-calculation';
      case 'Trend':
        return 'sem-tag sem-trend';
      case 'Correlation':
        return 'sem-tag sem-correlation';
      case 'AI Insight':
        return 'sem-tag sem-ai';
      case 'Unknown':
      default:
        return 'sem-tag sem-unknown';
    }
  };

  return (
    <span
      className={`${getVariantClass(normalized)} ${size === 'md' ? 'sem-tag-md' : ''}`}
      title={`Employee 360 Data Semantic: ${normalized}`}
    >
      <span className="sem-dot" aria-hidden="true" />
      <span>{normalized}</span>
    </span>
  );
};

interface ConfidenceLabelProps {
  confidence: ConfidenceLevel;
}

export const ConfidenceLabel: React.FC<ConfidenceLabelProps> = ({ confidence }) => {
  const label = confidence ? confidence.toUpperCase() : 'UNKNOWN';
  return (
    <span className={`conf-label conf-${confidence || 'unknown'}`}>
      Confidence: {label}
    </span>
  );
};

interface FieldValueDisplayProps {
  value: string | number | boolean | null | undefined;
  unknownLabel?: string;
  mono?: boolean;
}

/**
 * Preserves the architectural rule that missing/null values remain explicitly Unknown
 * and are never fabricated or hidden as blank space.
 */
export const FieldValueDisplay: React.FC<FieldValueDisplayProps> = ({
  value,
  unknownLabel = 'Unknown',
  mono = false,
}) => {
  if (value === null || value === undefined || value === '') {
    return (
      <span className="unknown-inline" title="Not available in Zoho People source record">
        {unknownLabel}
      </span>
    );
  }

  if (typeof value === 'boolean') {
    return <span className={mono ? 'mono-num' : ''}>{value ? 'Yes' : 'No'}</span>;
  }

  return <span className={mono ? 'mono-num' : ''}>{String(value)}</span>;
};

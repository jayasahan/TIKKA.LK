import React from "react";

export default function CustomerLoading() {
  return <section className="customer-loading section" aria-busy="true" aria-label="Loading customer portal"><div className="container"><div className="form-card card card--elevated"><p className="eyebrow">TIKKA Customer Portal</p><h1 className="sr-only">Loading your account</h1><p className="sr-only">Checking your session and services.</p><div className="customer-loading__layout" aria-hidden="true"><div className="skeleton skeleton--summary"><span className="skeleton__line skeleton__line--short" /><span className="skeleton__line" /></div><div className="skeleton skeleton--summary"><span className="skeleton__line skeleton__line--short" /><span className="skeleton__line" /></div><div className="skeleton skeleton--card"><span className="skeleton__line skeleton__line--short" /><span className="skeleton__line" /><span className="skeleton__line" /></div></div></div></div></section>;
}

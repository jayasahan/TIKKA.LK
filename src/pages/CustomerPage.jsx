import React, { useEffect, useRef, useState } from "react";
import { CustomerAuthProvider, useCustomerAuth } from "../features/auth/CustomerAuthContext.jsx";
import { customerService } from "../services/customer.js";
import useHash from "../hooks/useHash.js";
import CustomerHeader from "../components/customer/CustomerHeader.jsx";
import AuthPanel from "../components/customer/AuthPanel.jsx";
import CustomerLoading from "../components/customer/CustomerLoading.jsx";
import RequestForm from "../components/customer/RequestForm.jsx";
import RequestList from "../components/customer/RequestList.jsx";
import RequestDetail from "../components/customer/RequestDetail.jsx";
import CustomerProfile from "../components/customer/CustomerProfile.jsx";
import { activeStatuses, completedStatuses, closedStatuses } from "../features/customer/status.js";
import { MiniRequest, RequestCard } from "../components/customer/RequestCard.jsx";

function panelFromHash(hash) { const value = hash.slice(1); return ["overview", "request", "requests", "profile"].includes(value) ? value : "overview"; }
function counts(requests) { return { active: requests.filter((item) => activeStatuses.includes(item.status)).length, scheduled: requests.filter((item) => item.scheduledAt && ["SCHEDULED", "ASSIGNED", "IN_PROGRESS"].includes(item.status)).length, completed: requests.filter((item) => completedStatuses.includes(item.status)).length, total: requests.length }; }

function CustomerDashboard({ customer, services, intendedService }) {
  const hash = useHash();
  const [requests, setRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestError, setRequestError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [explicitSelection, setExplicitSelection] = useState(0);
  const requestLoadSequence = useRef(0);
  const [filter, setFilter] = useState("active");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState("neutral");
  const panel = panelFromHash(hash);

  const loadRequests = async () => {
    const sequence = ++requestLoadSequence.current;
    setRequestsLoading(true); setRequestError(null);
    try {
      const payload = await customerService.requests();
      if (sequence !== requestLoadSequence.current) return true;
      setRequests(payload.requests || []);
      return true;
    } catch (error) {
      if (sequence !== requestLoadSequence.current) return false;
      setRequestError(error);
      return false;
    } finally { if (sequence === requestLoadSequence.current) setRequestsLoading(false); }
  };
  useEffect(() => { loadRequests().catch(() => {}); }, []);
  useEffect(() => { if (!selectedId && requests[0]) setSelectedId(requests[0].id); }, [requests, selectedId]);
  const selected = requests.find((item) => item.id === selectedId) || requests[0] || null;
  const summary = counts(requests);
  const go = (name) => { window.location.hash = name; };
  const selectRequest = (id) => { setSelectedId(id); setExplicitSelection((value) => value + 1); setFilter("all"); window.location.hash = "requests"; };
  const onRequestSuccess = async (payload) => {
    const refreshFailed = !(await loadRequests());
    if (refreshFailed) setRequests((current) => [payload.request, ...current.filter((item) => item.id !== payload.request.id)]);
    setSelectedId(payload.request.id);
    setMessage(refreshFailed ? `${payload.message} Reference: ${payload.request.reference}. Refresh your requests to see the latest status.` : `${payload.message} Reference: ${payload.request.reference}`); setMessageTone("success"); go("requests");
  };
  const onChanged = async (id, successMessage) => {
    const refreshed = await loadRequests();
    setSelectedId(id); setMessage(refreshed ? successMessage : `${successMessage} The change was saved, but the latest request data could not be loaded. Refresh and try again.`); setMessageTone("success");
  };
  const onMessage = (text, tone = "neutral") => { setMessage(text); setMessageTone(tone); };
  const active = requests.filter((item) => activeStatuses.includes(item.status));
  const upcoming = requests.filter((item) => item.scheduledAt && ["SCHEDULED", "ASSIGNED", "IN_PROGRESS"].includes(item.status));
  const completed = requests.filter((item) => completedStatuses.includes(item.status));

  return <>
    <CustomerHeader customer={customer} onLogout={async () => { await customerService.logout(); window.location.reload(); }} />
    <main id="main">
      <section className="customer-hero section" id="overview" hidden={panel !== "overview"}><div className="container customer-hero__grid"><div><p className="eyebrow">TIKKA Customer Portal</p><h1>Hi {customer.name}, what can TIKKA help with today?</h1><p>Request service, track scheduled visits, and confirm completed work in one place.</p><div className="customer-hero__actions"><a className="button button--primary" href="#request">Request a Service</a><a className="button button--secondary" href="#requests">View My Requests</a></div></div><div className="customer-summary">{[["Active requests", summary.active, "Needs attention or is in progress"], ["Scheduled visits", summary.scheduled, "A date has been arranged"], ["Completed jobs", summary.completed, "Ready to confirm or review"], ["All requests", summary.total, "Your TIKKA request history"]].map(([label, value, hint]) => <article className="card card--summary" key={label}><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>)}</div></div></section>
      <section className="section section--tight" hidden={panel !== "overview"}><div className="container customer-dashboard-grid"><section className="customer-panel"><div className="section-heading section-heading--inline"><div><p className="eyebrow">Current Work</p><h2>Active requests</h2></div></div><div className="customer-card-grid">{requestsLoading ? <div className="skeleton skeleton--card" aria-hidden="true" /> : active.length ? active.slice(0, 4).map((item) => <RequestCard key={item.id} request={item} compact onSelect={selectRequest} />) : <div className="ui-state"><h3>No active jobs</h3><p>Request a service when you are ready. TIKKA will take it from there.</p><a className="button button--secondary" href="#request">Request a service</a></div>}</div></section><section className="customer-panel"><div className="section-heading section-heading--inline"><div><p className="eyebrow">Scheduled</p><h2>Upcoming jobs</h2></div></div><div className="customer-stack">{requestsLoading ? <div className="skeleton skeleton--row" aria-hidden="true" /> : upcoming.length ? upcoming.slice(0, 5).map((item) => <MiniRequest key={item.id} request={item} onSelect={selectRequest} />) : <div className="ui-state"><h3>No scheduled visits</h3><p>Scheduled job details will appear here after TIKKA reviews your request.</p></div>}</div></section><section className="customer-panel"><div className="section-heading section-heading--inline"><div><p className="eyebrow">Completed</p><h2>Recent completed jobs</h2></div></div><div className="customer-stack">{requestsLoading ? <div className="skeleton skeleton--row" aria-hidden="true" /> : completed.length ? completed.slice(0, 5).map((item) => <MiniRequest key={item.id} request={item} onSelect={selectRequest} />) : <div className="ui-state"><h3>No completed jobs yet</h3><p>Completed and confirmed jobs will appear here.</p></div>}</div></section></div></section>
      <div hidden={panel !== "request"}><RequestForm services={services} customer={customer} intendedService={intendedService} onSuccess={onRequestSuccess} /></div>
      <div hidden={panel !== "requests"}><div className="container"><div className="form-message" role="status" aria-live="polite" data-tone={messageTone}>{message}</div></div><RequestList requests={requests} filter={filter} onFilter={setFilter} onSelect={selectRequest} loading={requestsLoading} error={requestError} onRetry={loadRequests} detail={<RequestDetail request={selected ? { ...selected, __explicit: explicitSelection } : null} onChanged={onChanged} onMessage={onMessage} />} /></div>
      <div hidden={panel !== "profile"}><CustomerProfile customer={customer} services={services} onRequestService={(name) => { window.history.replaceState(null, "", `?service=${encodeURIComponent(name)}#request`); window.dispatchEvent(new HashChangeEvent("hashchange")); }} /></div>
    </main>
    <footer className="site-footer"><div className="container footer-grid"><div><a className="brand footer-brand" href="/#home" aria-label="TIKKA home"><img src="/public/brand/tikka-logo.jpg" alt="TIKKA logo" width="1600" height="1200" /></a><p>TIKKA coordinates skilled technicians and teams for repairs, cleaning, maintenance, and everyday jobs.</p></div><div><h2>Customer</h2><ul><li><a href="#request">Submit request</a></li><li><a href="#requests">Track request</a></li><li><a href="#profile">Profile</a></li></ul></div><div><h2>Contact</h2><p>Contact details coming soon.</p></div></div><div className="container footer-bottom"><p>&copy; 2026 TIKKA. All rights reserved.</p></div></footer>
  </>;
}

function CustomerSurface() {
  const { customer, loading, setCustomer } = useCustomerAuth();
  const [services, setServices] = useState([]);
  const [servicesError, setServicesError] = useState("");
  const intendedService = new URLSearchParams(window.location.search).get("service") || "";
  useEffect(() => { let active = true; customerService.services().then((payload) => { if (active) setServices(payload.services || []); }).catch((error) => { if (active) setServicesError(error.message); }); return () => { active = false; }; }, []);
  if (loading) return <><CustomerHeader customer={null} onLogout={() => Promise.resolve()} /><CustomerLoading /></>;
  if (!customer) return <><CustomerHeader customer={null} onLogout={() => Promise.resolve()} /><AuthPanel intendedService={intendedService} authError={servicesError} onAuthenticated={async (payload) => setCustomer(payload.customer)} /></>;
  return <CustomerDashboard customer={customer} services={services} intendedService={intendedService} />;
}

export default function CustomerPage() { return <CustomerAuthProvider><CustomerSurface /></CustomerAuthProvider>; }

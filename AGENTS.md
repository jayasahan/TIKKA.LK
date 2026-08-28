# TIKKA — Development Rules

## 1. Product Identity

Product name:

**TIKKA**

Sinhala brand phrase:

**ඕනි වැඩකට**

English tagline:

**Someone for every job.**

TIKKA is a Sri Lankan handyman and skilled-services outsourcing platform.

The business connects customers with qualified skilled people for:

* Repairs
* Cleaning
* Plumbing
* Electrical work
* Painting
* Handyman work
* Furniture assembly
* Moving
* Gardening
* Maintenance
* Other small jobs

The core promise:

**Qualified skilled people. Hassle-free service. Transparent fees.**

---

## 2. Official Brand Asset

The official TIKKA logo is located at:

`/public/brand/tikka-logo.svg`

This is the authoritative logo.

### Logo rules

NEVER:

* recreate the logo using text
* generate a replacement logo
* redesign the logo
* distort the logo
* stretch the logo
* change its proportions
* apply arbitrary effects to the logo
* replace it with a text approximation

Always use the official asset when the TIKKA logo is required.

Use CSS sizing while preserving the original aspect ratio.

If a different logo variant is genuinely required and an official variant does not exist, do not invent one. Flag the requirement.

---

## 3. Brand Colors

Primary:

`#FCE314`

Black:

`#000000`

White:

`#FFFFFF`

Use these as the foundation of the visual system.

Yellow should be used strategically for:

* Primary actions
* Highlights
* Brand moments
* Important visual accents

Do not make every surface yellow.

---

## 4. Visual Direction

TIKKA should feel:

* Modern
* Bold
* Friendly
* Trustworthy
* Local
* Fast
* Premium but accessible

Design language:

* Fluid layouts
* Strong typography
* Generous spacing
* Rounded surfaces
* Subtle liquid-glass influence
* Smooth micro-interactions
* Purposeful animation
* Excellent mobile experience

Liquid-glass styling must remain subtle.

Avoid:

* Excessive blur
* Excessive transparency
* Excessive gradients
* Animation everywhere
* Slow animations
* Generic corporate SaaS styling
* Clutter
* Poor contrast

Animations must respect:

`prefers-reduced-motion`

---

## 5. Product Philosophy

TIKKA MVP is a managed handyman/service outsourcing business.

It is NOT initially a fully automated marketplace.

The initial operating model is:

Customer submits job
→ TIKKA reviews request
→ TIKKA selects suitable skilled provider
→ Provider performs job
→ Customer confirms completion
→ Customer reviews service

Admin/operator control is therefore important.

---

## 6. MVP Roles

There are three primary roles.

### Customer

Can:

* Browse services
* Submit job requests
* Provide job details
* Provide location
* Upload optional photos
* View request status
* View assigned provider
* Confirm completion
* Review service

### Service Provider

Can:

* Register
* Create profile
* Submit verification information
* Add skills/services
* Add service area
* View assigned jobs
* Accept/reject jobs
* Start jobs
* Mark jobs completed

### Admin

Can:

* Securely access admin dashboard
* Review providers
* Approve/reject providers
* View customers
* View job requests
* Assign providers
* Manage job statuses
* Manage service categories
* View/moderate reviews
* View basic operational statistics

---

## 7. MVP Job Lifecycle

Use this status model:

`NEW`

→ `REVIEWING`

→ `ASSIGNED`

→ `ACCEPTED`

→ `IN_PROGRESS`

→ `COMPLETED`

→ `CONFIRMED`

Exceptional states:

`CANCELLED`

`REJECTED`

Do not create unnecessary additional statuses without a clear business requirement.

---

## 8. MVP Scope

The MVP must prove this:

A real customer can request a real job.

TIKKA can review the request.

TIKKA can assign a qualified provider.

The provider can perform and complete the job.

The customer can confirm and review the service.

Everything else is secondary.

---

## 9. Explicitly Out of Scope

Unless specifically requested in a later phase, DO NOT implement:

* Online payments
* Automated provider matching
* AI matching
* Real-time GPS tracking
* Real-time chat
* Native mobile applications
* Subscriptions
* Coupons
* Complex commission systems
* Advanced analytics
* Payroll
* Accounting
* Complex CRM

The architecture may allow future expansion, but these features are not part of the MVP.

---

## 10. AI Coding Rules

Before changing code:

1. Inspect the repository.
2. Understand the existing architecture.
3. Identify existing dependencies.
4. Reuse existing components and utilities.
5. Avoid unnecessary rewrites.
6. Avoid unnecessary dependencies.
7. Follow existing project conventions.

Do not invent requirements.

If something is ambiguous:

* Choose the smallest reasonable implementation.
* Do not build an elaborate feature.
* Document the assumption.

Never silently expand scope.

---

## 11. Phase Discipline

Development is divided into five phases:

### Phase 1

Foundation + Brand + Landing Page

### Phase 2

Customer Experience

### Phase 3

Service Provider Experience

### Phase 4

Admin + Operations

### Phase 5

Testing + Security + Performance + Deployment

Only implement the current phase.

Do not start future phases.

---

## 12. Verification Rule

After implementation:

* Run type checking
* Run linting
* Run available tests
* Run production build

Fix errors before declaring the phase complete.

Never claim something works without verifying it.

At the end of every phase report:

1. What changed
2. Files created
3. Files modified
4. Dependencies added
5. Tests performed
6. Build result
7. Assumptions
8. Known issues

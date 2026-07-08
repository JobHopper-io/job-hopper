import React, { useState } from "react";
import {
  Lock,
  Briefcase,
  CheckCircle,
  MapPin,
  Building2,
  Star,
  Lightbulb,
  BarChart2,
  EyeOff,
  Phone,
} from "lucide-react";

// ─── Design tokens ────────────────────────────────────────────────
const BLUE = "#2F6ECC";
const CHARCOAL = "#111827";
const BODY = "#374151";
const PAGE_BG = "#F9FAFB";
const CARD_BG = "#FFFFFF";
const BORDER = "#E5E7EB";

type Tier = "free" | "core" | "premium";

// ─── Layout wrapper ───────────────────────────────────────────────
// All page content sits inside this — centered, max 1160px, generous side padding.
function PageWrap({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        maxWidth: 1160,
        margin: "0 auto",
        padding: "40px 40px",
      }}
    >
      {children}
    </div>
  );
}

// ─── Nav bar ──────────────────────────────────────────────────────
function NavBar({
  tier,
  activePage,
}: {
  tier: Tier;
  activePage?: "dashboard" | "premium-tools";
}) {
  return (
    <nav
      style={{
        background: CARD_BG,
        borderBottom: `1px solid ${BORDER}`,
        padding: "0 40px",
      }}
    >
      <div
        style={{
          maxWidth: 1160,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 56,
        }}
      >
        {/* Logo mark — circular gradient icon + blue wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              background: "linear-gradient(135deg, #FFD75A 0%, #FF8A34 100%)",
              borderRadius: "50%",
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 1px 4px rgba(255,138,52,0.35)",
            }}
          >
            <Briefcase size={16} color="white" />
          </div>
          <span
            style={{
              fontFamily: "Poppins, sans-serif",
              fontWeight: 700,
              color: BLUE,
              fontSize: 17,
              letterSpacing: "-0.01em",
            }}
          >
            Job-Hopper
          </span>
        </div>

        {/* Nav links — generous spacing, active in blue, rest in gray */}
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          {["Dashboard", "Profile", "Billing", "Sign Out"].map((item) => {
            const isActive = item === "Dashboard" && activePage === "dashboard";
            return (
              <span
                key={item}
                style={{
                  fontSize: 14,
                  color: isActive ? BLUE : "#6B7280",
                  fontFamily: "Inter, sans-serif",
                  cursor: "pointer",
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {item}
              </span>
            );
          })}
          {tier === "premium" && (
            <span
              style={{
                fontSize: 14,
                color: activePage === "premium-tools" ? BLUE : "#6B7280",
                fontFamily: "Inter, sans-serif",
                cursor: "pointer",
                fontWeight: activePage === "premium-tools" ? 600 : 400,
                paddingLeft: 20,
                borderLeft: `1px solid ${BORDER}`,
              }}
            >
              Premium Tools
            </span>
          )}
        </div>
      </div>
    </nav>
  );
}

// ─── Summary card ─────────────────────────────────────────────────
function SummaryCard({
  label,
  stat,
  caption,
  link,
}: {
  label: string;
  stat: string;
  caption: string;
  link?: string;
}) {
  return (
    <div
      style={{
        background: CARD_BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        flex: 1,
        padding: 20,
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      }}
    >
      <p
        style={{
          fontSize: 11,
          color: "#6B7280",
          letterSpacing: "0.07em",
          fontFamily: "Inter, sans-serif",
          fontWeight: 600,
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 28,
          fontWeight: 700,
          fontFamily: "Poppins, sans-serif",
          color: CHARCOAL,
          lineHeight: 1.15,
        }}
      >
        {stat}
      </p>
      <p
        style={{
          fontSize: 13,
          color: "#6B7280",
          fontFamily: "Inter, sans-serif",
          marginTop: 6,
        }}
      >
        {caption}
      </p>
      {link && (
        <a
          href="#"
          style={{
            fontSize: 13,
            color: BLUE,
            fontFamily: "Inter, sans-serif",
            display: "block",
            marginTop: 6,
          }}
        >
          {link}
        </a>
      )}
    </div>
  );
}

// ─── Teaser overlay ───────────────────────────────────────────────
function TeaserOverlay({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "relative" }}>
      <div style={{ filter: "blur(4px)", userSelect: "none", pointerEvents: "none" }}>
        {children}
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        <Lock size={15} color={BLUE} />
        <a
          href="#"
          style={{
            fontSize: 13,
            color: BLUE,
            fontFamily: "Inter, sans-serif",
            fontWeight: 600,
          }}
        >
          Upgrade to unlock
        </a>
      </div>
    </div>
  );
}

// ─── Teased feature card (Free tier) ─────────────────────────────
function TeasedFeatureCard({
  title,
  realFields,
  blurredFields,
}: {
  title: string;
  realFields: string[];
  blurredFields: string[];
}) {
  return (
    <div
      style={{
        background: CARD_BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        padding: 20,
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      }}
    >
      <p
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: CHARCOAL,
          fontFamily: "Inter, sans-serif",
          marginBottom: 10,
        }}
      >
        {title}
      </p>
      <div style={{ marginBottom: 6 }}>
        {realFields.map((f) => (
          <p key={f} style={{ fontSize: 13, color: BODY, fontFamily: "Inter, sans-serif", lineHeight: 1.7 }}>
            {f}
          </p>
        ))}
      </div>
      <TeaserOverlay>
        <div>
          {blurredFields.map((f) => (
            <p key={f} style={{ fontSize: 13, color: BODY, fontFamily: "Inter, sans-serif", lineHeight: 1.7 }}>
              {f}
            </p>
          ))}
        </div>
      </TeaserOverlay>
    </div>
  );
}

// ─── Full feature card (Core / Premium) ──────────────────────────
function FullFeatureCard({
  title,
  fields,
}: {
  title: string;
  fields: { label: string; value: string; valueColor?: string }[];
}) {
  return (
    <div
      style={{
        background: CARD_BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        padding: 20,
        flex: 1,
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      }}
    >
      <p
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: CHARCOAL,
          fontFamily: "Inter, sans-serif",
          marginBottom: 12,
        }}
      >
        {title}
      </p>
      {fields.map((f) => (
        <div
          key={f.label}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}
        >
          <span style={{ fontSize: 13, color: "#6B7280", fontFamily: "Inter, sans-serif" }}>
            {f.label}
          </span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: f.valueColor || BODY,
              fontFamily: "Inter, sans-serif",
            }}
          >
            {f.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Sponsor / locked badges ──────────────────────────────────────
function SponsorBadge({ tier, sponsored }: { tier: Tier; sponsored: boolean }) {
  if (tier === "free") {
    return (
      <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
        <span
          style={{
            fontSize: 11,
            background: "#F3F4F6",
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            padding: "2px 10px",
            color: "transparent",
            filter: "blur(3px)",
            fontFamily: "Inter, sans-serif",
          }}
        >
          Sponsored
        </span>
        <Lock
          size={9}
          color="#9CA3AF"
          style={{ position: "absolute", left: "50%", transform: "translateX(-50%)" }}
        />
      </span>
    );
  }
  if (!sponsored) return null;
  return (
    <span
      style={{
        fontSize: 11,
        background: "#EEF2FF",
        border: "1px solid #C7D2FE",
        borderRadius: 12,
        color: "#4338CA",
        padding: "2px 10px",
        fontFamily: "Inter, sans-serif",
        fontWeight: 600,
      }}
    >
      Sponsored
    </span>
  );
}

// ─── Action buttons ───────────────────────────────────────────────
function ActionBtn({ label, primary, locked }: { label: string; primary?: boolean; locked?: boolean }) {
  if (locked) {
    return (
      <button
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          color: "#9CA3AF",
          borderRadius: 12,
          fontSize: 13,
          padding: "7px 14px",
          fontFamily: "Inter, sans-serif",
          fontWeight: 600,
          background: "#F3F4F6",
          border: `1px solid ${BORDER}`,
          cursor: "default",
        }}
      >
        <Lock size={11} />
        {label}
      </button>
    );
  }
  if (primary) {
    return (
      <button
        style={{
          background: BLUE,
          color: "white",
          borderRadius: 12,
          fontSize: 13,
          padding: "7px 16px",
          fontFamily: "Inter, sans-serif",
          fontWeight: 600,
          border: "none",
          cursor: "pointer",
        }}
      >
        {label}
      </button>
    );
  }
  return (
    <button
      style={{
        color: BLUE,
        borderRadius: 12,
        fontSize: 13,
        padding: "7px 14px",
        fontFamily: "Inter, sans-serif",
        fontWeight: 600,
        background: "transparent",
        border: `1px solid ${BORDER}`,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

// ─── Job match card ───────────────────────────────────────────────
function JobMatchCard({
  tier,
  title,
  company,
  location,
  score,
  sponsored,
}: {
  tier: Tier;
  title: string;
  company: string;
  location: string;
  score: number;
  sponsored: boolean;
}) {
  return (
    <div
      style={{
        background: CARD_BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        padding: 20,
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0, paddingRight: 16 }}>
          <p
            style={{
              fontWeight: 700,
              color: CHARCOAL,
              fontFamily: "Poppins, sans-serif",
              fontSize: 17,
            }}
          >
            {title}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
            <Building2 size={13} color="#9CA3AF" />
            <span style={{ fontSize: 14, color: BODY, fontFamily: "Inter, sans-serif" }}>{company}</span>
            <MapPin size={13} color="#9CA3AF" />
            <span style={{ fontSize: 14, color: BODY, fontFamily: "Inter, sans-serif" }}>{location}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span
            style={{
              fontSize: 12,
              background: "#EFF6FF",
              border: "1px solid #BFDBFE",
              borderRadius: 12,
              color: BLUE,
              padding: "3px 10px",
              fontFamily: "Inter, sans-serif",
              fontWeight: 600,
            }}
          >
            Match {score}%
          </span>
          <SponsorBadge tier={tier} sponsored={sponsored} />
        </div>
      </div>
      <p
        style={{
          fontSize: 13,
          color: "#6B7280",
          fontFamily: "Inter, sans-serif",
          lineHeight: 1.65,
          marginBottom: 14,
        }}
      >
        Innovative team seeking a skilled engineer in a remote-friendly environment.
        Competitive compensation and equity included.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <ActionBtn label="View details" primary />
        <ActionBtn label="Apply" />
        <ActionBtn label="Get resume advice" locked={tier === "free"} />
        {(tier === "free" || tier === "premium") && (
          <ActionBtn label="Premium Insights" locked={tier === "free"} />
        )}
      </div>
    </div>
  );
}

// ─── Application Tracker ──────────────────────────────────────────
function ApplicationTracker() {
  const apps = [
    { title: "Senior React Dev", company: "TechFlow", status: "Interviewing", color: "#1D4ED8", bg: "#EFF6FF" },
    { title: "Frontend Engineer", company: "Dropforge", status: "Applied", color: "#6B7280", bg: "#F3F4F6" },
    { title: "UI/UX Developer", company: "Launchpad", status: "Offer", color: "#15803D", bg: "#F0FDF4" },
  ];
  return (
    <div
      style={{
        background: CARD_BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        padding: 20,
        marginBottom: 20,
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      }}
    >
      <p
        style={{
          fontWeight: 700,
          color: CHARCOAL,
          fontFamily: "Poppins, sans-serif",
          fontSize: 16,
          marginBottom: 16,
        }}
      >
        Application Tracker
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {apps.map((app) => (
          <div
            key={app.title}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
          >
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: CHARCOAL, fontFamily: "Inter, sans-serif" }}>
                {app.title}
              </p>
              <p style={{ fontSize: 13, color: "#6B7280", fontFamily: "Inter, sans-serif" }}>
                {app.company}
              </p>
            </div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: app.color,
                background: app.bg,
                borderRadius: 12,
                padding: "3px 12px",
                fontFamily: "Inter, sans-serif",
              }}
            >
              {app.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Premium Tools card ───────────────────────────────────────────
const premiumTools = [
  { icon: Star,      name: "Sponsor Watch",          desc: "Track which employers are actively sponsoring right now" },
  { icon: Lightbulb, name: "Apply Intelligence",      desc: "See the best time and way to apply for each role" },
  { icon: BarChart2, name: "Sponsorship Score",        desc: "Real visa sponsorship likelihood, based on DOL and USCIS data" },
  { icon: EyeOff,    name: "Ghost Listing Detector",   desc: "Flags postings that are unlikely to be actively hiring" },
  { icon: Phone,     name: "Hiring Manager Contact",   desc: "Direct contact info for the actual hiring manager" },
];

function PremiumToolsCard() {
  return (
    <div
      style={{
        background: CARD_BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        marginBottom: 20,
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        overflow: "hidden",
        display: "flex",
      }}
    >
      {/* Yellow-orange accent strip */}
      <div
        style={{
          width: 3,
          flexShrink: 0,
          background: "linear-gradient(180deg, #FFD75A 0%, #FF8A34 100%)",
          borderRadius: "12px 0 0 12px",
        }}
      />
      <div style={{ flex: 1, padding: 20 }}>
      <p
        style={{
          fontWeight: 700,
          color: CHARCOAL,
          fontFamily: "Poppins, sans-serif",
          fontSize: 16,
          marginBottom: 16,
        }}
      >
        Premium Tools
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {premiumTools.map(({ icon: Icon, name, desc }) => (
          <div key={name} style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ background: "#EFF6FF", borderRadius: 8, padding: 9, flexShrink: 0 }}>
              <Icon size={16} color={BLUE} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: CHARCOAL, fontFamily: "Inter, sans-serif" }}>
                {name}
              </p>
              <p style={{ fontSize: 13, color: "#6B7280", fontFamily: "Inter, sans-serif" }}>
                {desc}
              </p>
            </div>
            <span
              style={{
                flexShrink: 0,
                fontSize: 11,
                fontWeight: 600,
                color: "#92400E",
                background: "#FFFBEB",
                border: "1px solid #FDE68A",
                borderRadius: 20,
                padding: "3px 10px",
                fontFamily: "Inter, sans-serif",
                whiteSpace: "nowrap",
              }}
            >
              Preview
            </span>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}

// ─── Shared sections ──────────────────────────────────────────────
function SummaryRow({ tier }: { tier: Tier }) {
  return (
    <div style={{ display: "flex", gap: 20, marginBottom: 24 }}>
      <SummaryCard
        label="Subscription"
        stat={tier === "free" ? "Free" : tier === "core" ? "Core" : "Premium"}
        caption={tier === "free" ? "No card on file" : "Next digest: tomorrow, 9:00am"}
        link={tier === "free" ? "Upgrade" : undefined}
      />
      <SummaryCard
        label="Active Features"
        stat={tier === "free" ? "1" : tier === "core" ? "4" : "9"}
        caption={
          tier === "free"
            ? "Manual search only"
            : tier === "core"
            ? "Matching + Tracker"
            : "All features active"
        }
      />
      <SummaryCard
        label="Matches This Week"
        stat={tier === "free" ? "3" : "14"}
        caption={tier === "free" ? "Manual results" : "Auto-matched for you"}
      />
      <SummaryCard
        label="Profile Strength"
        stat="78%"
        caption="Good — 2 items to add"
        link="Improve"
      />
    </div>
  );
}

function AutomatchBanner() {
  return (
    <div
      style={{
        background: "#F0FDF4",
        border: "1px solid #BBF7D0",
        borderRadius: 12,
        padding: "16px 20px",
        marginBottom: 20,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <CheckCircle size={18} color="#15803D" />
        <p style={{ fontWeight: 700, color: "#14532D", fontFamily: "Poppins, sans-serif", fontSize: 16 }}>
          Automated matching active
        </p>
      </div>
      <p style={{ fontSize: 13, color: "#166534", fontFamily: "Inter, sans-serif", paddingLeft: 28 }}>
        Next digest: tomorrow 9:00am · 14 new matches this week
      </p>
    </div>
  );
}

function ResumeAndInsights() {
  return (
    <div style={{ display: "flex", gap: 20, marginBottom: 20 }}>
      <FullFeatureCard
        title="Resume Advice"
        fields={[
          { label: "Keyword match", value: "Strong ✓", valueColor: "#15803D" },
          { label: "Experience level", value: "Aligns ✓", valueColor: "#15803D" },
          { label: "CI/CD mention", value: "Add it →", valueColor: "#B45309" },
          { label: "Portfolio link", value: "Missing →", valueColor: "#B45309" },
        ]}
      />
      <FullFeatureCard
        title="Premium Insights"
        fields={[
          { label: "Hiring activity", value: "High", valueColor: "#15803D" },
          { label: "Your match rank", value: "Top 8%", valueColor: "#15803D" },
          { label: "Avg. time to offer", value: "3.2 wks" },
          { label: "Salary band", value: "$120k–$145k" },
        ]}
      />
    </div>
  );
}

const JOBS = [
  { title: "Senior Frontend Engineer", company: "Stripe", location: "Remote, US", score: 94, sponsored: true },
  { title: "React Developer", company: "Notion", location: "San Francisco, CA", score: 87, sponsored: false },
];

// ─── Dashboard pages ──────────────────────────────────────────────
function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h1
        style={{
          fontFamily: "Poppins, sans-serif",
          fontWeight: 700,
          fontSize: 30,
          color: CHARCOAL,
          margin: 0,
          lineHeight: 1.2,
        }}
      >
        {title}
      </h1>
      <p style={{ fontSize: 15, color: BODY, marginTop: 6, fontFamily: "Inter, sans-serif" }}>
        {subtitle}
      </p>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontFamily: "Poppins, sans-serif",
        fontWeight: 700,
        fontSize: 20,
        color: CHARCOAL,
        marginBottom: 16,
        marginTop: 4,
      }}
    >
      {children}
    </h2>
  );
}

function FreeDashboard() {
  return (
    <div style={{ background: PAGE_BG, minHeight: "100vh" }}>
      <NavBar tier="free" activePage="dashboard" />
      <PageWrap>
        <PageHeader title="Good morning, Alex" subtitle="Here are your latest job matches." />
        <SummaryRow tier="free" />

        {/* Manual search panel */}
        <div
          style={{
            background: CARD_BG,
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            padding: 24,
            marginBottom: 20,
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
            <div
              style={{
                background: "linear-gradient(135deg, #FFD75A 0%, #FF8A34 100%)",
                borderRadius: "50%",
                width: 36,
                height: 36,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                boxShadow: "0 1px 4px rgba(255,138,52,0.30)",
              }}
            >
              <Briefcase size={18} color="white" />
            </div>
            <p style={{ fontWeight: 700, color: CHARCOAL, fontFamily: "Poppins, sans-serif", fontSize: 17, margin: 0 }}>
              Run another job search
            </p>
          </div>
          <p style={{ fontSize: 14, color: BODY, fontFamily: "Inter, sans-serif", marginBottom: 16 }}>
            Search for roles matching your skills. Results are saved to your matches list.
          </p>
          <div
            style={{
              background: "#FFFBEB",
              border: "1px solid #FDE68A",
              borderRadius: 12,
              padding: "10px 14px",
              marginBottom: 16,
            }}
          >
            <p style={{ fontSize: 13, color: "#92400E", fontFamily: "Inter, sans-serif" }}>
              Just 1 free search left. Make it count, or upgrade anytime.
            </p>
          </div>
          <p style={{ fontSize: 13, color: "#6B7280", fontFamily: "Inter, sans-serif", marginBottom: 16 }}>
            You have used <strong style={{ color: BODY }}>2 of 3</strong> manual searches.
          </p>
          <button
            style={{
              background: BLUE,
              color: "white",
              borderRadius: 12,
              fontSize: 14,
              padding: "9px 20px",
              fontFamily: "Inter, sans-serif",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
            }}
          >
            Run job search
          </button>
          <p style={{ fontSize: 12, color: "#9CA3AF", fontFamily: "Inter, sans-serif", marginTop: 10, fontStyle: "italic" }}>
            * At 0 remaining: button disabled — "Upgrade to continue"
          </p>
        </div>

        {/* Teased cards side by side */}
        <div style={{ display: "flex", gap: 20, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <TeasedFeatureCard
              title="Resume Advice"
              realFields={[
                '✓ Strong keyword match for "TypeScript"',
                "✓ Experience level aligns with this role",
              ]}
              blurredFields={[
                "○ Missing: CI/CD experience not highlighted",
                "○ Recommend: add portfolio link",
                "○ Estimated salary band: $120k–$145k",
              ]}
            />
          </div>
          <div style={{ flex: 1 }}>
            <TeasedFeatureCard
              title="Premium Insights"
              realFields={[
                "→ Stripe is actively hiring for this role",
                "→ 94% match — above average for your profile",
              ]}
              blurredFields={[
                "→ Sponsorship likelihood: High (82/100)",
                "→ Avg. time to offer: 3.2 weeks",
                "→ Hiring manager identified",
              ]}
            />
          </div>
        </div>

        <SectionHeading>Recent Job Matches</SectionHeading>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {JOBS.map((job) => (
            <JobMatchCard key={job.title} tier="free" {...job} />
          ))}
        </div>
      </PageWrap>
    </div>
  );
}

function CoreDashboard() {
  return (
    <div style={{ background: PAGE_BG, minHeight: "100vh" }}>
      <NavBar tier="core" activePage="dashboard" />
      <PageWrap>
        <PageHeader title="Good morning, Alex" subtitle="Here are your latest job matches." />
        <SummaryRow tier="core" />
        <AutomatchBanner />
        <ApplicationTracker />
        <ResumeAndInsights />
        <SectionHeading>Recent Job Matches</SectionHeading>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {JOBS.map((job) => (
            <JobMatchCard key={job.title} tier="core" {...job} />
          ))}
        </div>
      </PageWrap>
    </div>
  );
}

function PremiumDashboard() {
  return (
    <div style={{ background: PAGE_BG, minHeight: "100vh" }}>
      <NavBar tier="premium" activePage="dashboard" />
      <PageWrap>
        <PageHeader title="Good morning, Alex" subtitle="Here are your latest job matches." />
        <SummaryRow tier="premium" />
        <AutomatchBanner />
        <ApplicationTracker />
        <ResumeAndInsights />
        <PremiumToolsCard />
        <SectionHeading>Recent Job Matches</SectionHeading>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {JOBS.map((job) => (
            <JobMatchCard key={job.title} tier="premium" {...job} />
          ))}
        </div>
      </PageWrap>
    </div>
  );
}

// ─── Sponsor Watch sub-page ───────────────────────────────────────
function SponsorWatchPage() {
  const rows = [
    { company: "Stripe",  industry: "Fintech",       filings: "142", status: "Active"  },
    { company: "Figma",   industry: "Design Tools",  filings: "87",  status: "Active"  },
    { company: "Linear",  industry: "Productivity",  filings: "34",  status: "Active"  },
    { company: "Vercel",  industry: "Dev Infra",     filings: "61",  status: "Active"  },
    { company: "Notion",  industry: "Productivity",  filings: "—",   status: "Unknown" },
  ];
  return (
    <div style={{ background: PAGE_BG, minHeight: "100vh" }}>
      <NavBar tier="premium" activePage="premium-tools" />
      <PageWrap>
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <Star size={22} color={BLUE} />
            <h1 style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: 30, color: CHARCOAL, margin: 0 }}>
              Sponsor Watch
            </h1>
          </div>
          <p style={{ fontSize: 15, color: BODY, fontFamily: "Inter, sans-serif" }}>
            Premium Tools · Employer sponsorship tracker
          </p>
        </div>

        {/* Concept banner */}
        <div
          style={{
            background: "#FFFBEB",
            border: "1px solid #FDE68A",
            borderRadius: 12,
            padding: "18px 24px",
            marginBottom: 24,
          }}
        >
          <p style={{ fontWeight: 700, fontSize: 16, color: "#92400E", fontFamily: "Poppins, sans-serif", marginBottom: 6 }}>
            Concept preview — not yet available.
          </p>
          <p style={{ fontSize: 14, color: "#92400E", fontFamily: "Inter, sans-serif", lineHeight: 1.6 }}>
            This feature is on our roadmap and rolling out soon. The data and UI below are
            illustrative only and do not reflect real employer activity.
          </p>
        </div>

        {/* Faded placeholder table */}
        <div
          style={{
            background: CARD_BG,
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            padding: 24,
            marginBottom: 20,
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            opacity: 0.45,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <p style={{ fontWeight: 700, color: CHARCOAL, fontFamily: "Poppins, sans-serif", fontSize: 16 }}>
              Active Sponsoring Employers
            </p>
            <span style={{ fontSize: 13, color: "#6B7280", fontFamily: "Inter, sans-serif" }}>
              Updated weekly · H-1B &amp; PERM data
            </span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 120px 110px",
              gap: 12,
              borderBottom: `1px solid ${BORDER}`,
              paddingBottom: 10,
              marginBottom: 6,
            }}
          >
            {["Company", "Industry", "Filings", "Status"].map((h) => (
              <p
                key={h}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#6B7280",
                  fontFamily: "Inter, sans-serif",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {h}
              </p>
            ))}
          </div>
          {rows.map((row) => (
            <div
              key={row.company}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 120px 110px",
                gap: 12,
                padding: "12px 0",
                borderBottom: `1px solid ${BORDER}`,
                alignItems: "center",
              }}
            >
              <p style={{ fontSize: 14, fontWeight: 600, color: CHARCOAL, fontFamily: "Inter, sans-serif" }}>
                {row.company}
              </p>
              <p style={{ fontSize: 13, color: BODY, fontFamily: "Inter, sans-serif" }}>{row.industry}</p>
              <p style={{ fontSize: 13, color: BODY, fontFamily: "Inter, sans-serif" }}>{row.filings}</p>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: row.status === "Active" ? "#15803D" : "#6B7280",
                  background: row.status === "Active" ? "#F0FDF4" : "#F3F4F6",
                  borderRadius: 20,
                  padding: "3px 12px",
                  fontFamily: "Inter, sans-serif",
                  display: "inline-block",
                }}
              >
                {row.status}
              </span>
            </div>
          ))}
        </div>

        {/* Faded filter bar */}
        <div
          style={{
            background: CARD_BG,
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            padding: 20,
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            opacity: 0.35,
          }}
        >
          <p style={{ fontSize: 14, fontWeight: 600, color: CHARCOAL, fontFamily: "Inter, sans-serif", marginBottom: 12 }}>
            Filter &amp; Export
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            {["Industry", "Location", "Filing type", "Date range"].map((f) => (
              <div
                key={f}
                style={{
                  background: "#F3F4F6",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  padding: "8px 14px",
                  fontSize: 13,
                  color: "#6B7280",
                  fontFamily: "Inter, sans-serif",
                }}
              >
                {f} ▾
              </div>
            ))}
            <div
              style={{
                background: BLUE,
                borderRadius: 8,
                padding: "8px 18px",
                fontSize: 13,
                color: "white",
                fontFamily: "Inter, sans-serif",
                fontWeight: 600,
              }}
            >
              Export CSV
            </div>
          </div>
        </div>
      </PageWrap>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────
type Screen = "free" | "core" | "premium" | "sponsor-watch";

const screens: { id: Screen; label: string; sub?: string }[] = [
  { id: "free",           label: "Free" },
  { id: "core",           label: "Core" },
  { id: "premium",        label: "Premium" },
  { id: "sponsor-watch",  label: "Sponsor Watch", sub: "Premium sub-page" },
];

export default function App() {
  const [active, setActive] = useState<Screen>("free");

  return (
    <div style={{ fontFamily: "Inter, sans-serif" }}>
      {/* Screen switcher */}
      <div
        style={{
          background: "#1F2937",
          padding: "10px 24px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: "#9CA3AF",
            fontFamily: "Inter, sans-serif",
            marginRight: 8,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
          }}
        >
          View screen:
        </span>
        {screens.map(({ id, label, sub }) => (
          <button
            key={id}
            onClick={() => setActive(id)}
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 13,
              fontWeight: 600,
              padding: "6px 16px",
              borderRadius: 20,
              border: "none",
              cursor: "pointer",
              background: active === id ? BLUE : "#374151",
              color: active === id ? "white" : "#D1D5DB",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {label}
            {sub && (
              <span style={{ fontSize: 11, opacity: 0.75, fontWeight: 400 }}>{sub}</span>
            )}
          </button>
        ))}
      </div>

      {/* Page content */}
      {active === "free"           && <FreeDashboard />}
      {active === "core"           && <CoreDashboard />}
      {active === "premium"        && <PremiumDashboard />}
      {active === "sponsor-watch"  && <SponsorWatchPage />}
    </div>
  );
}

import { useState, type ReactNode } from "react";
import { Icon } from "../components/icons";
import {
  Badge,
  Button,
  ErrorState,
  KeyValue,
  LoadingRows,
  Mono,
  Notice,
  PageHeader,
  Panel,
  SERVICE_LABEL,
  ServiceDot,
  SourceTag,
  Table,
  Tabs,
  tdClass,
} from "../components/ui";
import { useApp } from "../lib/appContext";
import type { AgentInfo, IntegrationSettings, ServiceCheck } from "../lib/types";
import { useApi } from "../lib/useApi";

type Tab = "integrations" | "agents" | "security" | "about";

const Secret = ({ ok }: { ok: boolean }) => (ok ? <span className="font-mono tracking-widest text-muted">••••••••</span> : <Badge tone="warn">Missing</Badge>);

function IntegrationCard({ title, check, children, env }: { title: string; check?: ServiceCheck; children: ReactNode; env: string }) {
  const status = check?.status ?? "unknown";
  return (
    <Panel
      title={title}
      aside={
        <span className="flex items-center gap-1.5">
          <ServiceDot status={status} /> {SERVICE_LABEL[status]}
          {check?.latency_ms !== null && check?.status === "connected" ? ` · ${check.latency_ms} ms` : ""}
        </span>
      }
    >
      {children}
      {check && check.status !== "connected" && <p className="m-0 text-xs text-fail">{check.message}</p>}
      <span className="text-[11px] text-subtle">
        Configured in <Mono>backend/.env</Mono>: <Mono>{env}</Mono>
      </span>
    </Panel>
  );
}

export default function Settings() {
  const [tab, setTab] = useState<Tab>("integrations");
  const { health, reloadHealth } = useApp();
  const cfg = useApi<IntegrationSettings>("/settings/integrations");
  const agents = useApi<{ agents: AgentInfo[] }>(tab === "agents" ? "/ai/agents" : null);
  const c = cfg.data;
  const sv = health?.services;

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Integration status and configuration. Secrets stay on the backend; this page only shows whether each one is set."
        actions={
          <Button
            onClick={() => {
              reloadHealth();
              cfg.reload();
            }}
            icon={<Icon.Refresh size={15} />}
          >
            Recheck connections
          </Button>
        }
      />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "integrations", label: "Integrations" },
          { value: "agents", label: "AI agents" },
          { value: "security", label: "Users & security" },
          { value: "about", label: "About" },
        ]}
      />

      {tab === "integrations" &&
        (cfg.error ? (
          <ErrorState error={cfg.error} onRetry={cfg.reload} />
        ) : !c ? (
          <LoadingRows rows={6} />
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <IntegrationCard title="Wazuh Manager API" check={sv?.wazuh_manager} env="WAZUH_API_URL, WAZUH_API_USERNAME, WAZUH_API_PASSWORD">
              <KeyValue
                items={[
                  ["URL", <Mono>{c.wazuh_manager.url ?? "—"}</Mono>],
                  ["Username", <Secret ok={c.wazuh_manager.username_configured} />],
                  ["Password", <Secret ok={c.wazuh_manager.password_configured} />],
                  ["TLS verification", c.wazuh_manager.verify_tls ? "On" : <Badge tone="warn">Off (lab self-signed cert)</Badge>],
                  [
                    "Daemons",
                    sv?.wazuh_manager.detail.daemons_total ? `${sv.wazuh_manager.detail.daemons_running} of ${sv.wazuh_manager.detail.daemons_total} running` : "—",
                  ],
                ]}
              />
            </IntegrationCard>
            <IntegrationCard title="Wazuh Indexer" check={sv?.wazuh_indexer} env="WAZUH_INDEXER_URL, WAZUH_INDEXER_USERNAME, WAZUH_INDEXER_PASSWORD">
              <KeyValue
                items={[
                  ["URL", <Mono>{c.wazuh_indexer.url ?? "—"}</Mono>],
                  ["Username", <Secret ok={c.wazuh_indexer.username_configured} />],
                  ["Password", <Secret ok={c.wazuh_indexer.password_configured} />],
                  ["TLS verification", c.wazuh_indexer.verify_tls ? "On" : <Badge tone="warn">Off (lab self-signed cert)</Badge>],
                  ["Version", (sv?.wazuh_indexer.detail.version as string) ?? "—"],
                ]}
              />
            </IntegrationCard>
            <IntegrationCard title="VIGIL agents service" check={sv?.vigil_agents} env="VIGIL_AGENTS_URL, VIGIL_AGENTS_TOKEN">
              <KeyValue
                items={[
                  ["URL", <Mono>{c.vigil_agents.url ?? "—"}</Mono>],
                  ["Bearer token", <Secret ok={c.vigil_agents.token_configured} />],
                  ["Evidence source", (sv?.vigil_agents.detail.connector_mode as string) ?? "—"],
                ]}
              />
            </IntegrationCard>
            <IntegrationCard title="PostgreSQL" check={sv?.database} env="DATABASE_URL">
              <KeyValue items={[["Connection", <Mono>{c.database.url ?? "—"}</Mono>], ["Credentials", <Secret ok={!!c.database.url} />]]} />
            </IntegrationCard>
            <Panel title="n8n / SOAR" aside={<span className="flex items-center gap-1.5"><ServiceDot status="not_configured" /> Planned</span>}>
              <p className="m-0 text-[13px] text-muted">{c.soar.note}</p>
            </Panel>
            <Panel title="LLM providers" aside={<SourceTag kind="cached">Agents service</SourceTag>}>
              <p className="m-0 text-[13px] text-muted">
                Provider keys (NVIDIA, DeepSeek, OpenAI, OpenRouter) live only in the agents service's environment or the Windows Credential Manager. Manage them with
                <Mono> vigil provider</Mono> and <Mono>vigil model select</Mono>.
              </p>
            </Panel>
          </div>
        ))}

      {tab === "agents" && (
        <Panel title="Agent model assignments" description="Read from the agents service. Each agent uses one provider/model per run.">
          {agents.error ? (
            <ErrorState error={agents.error} onRetry={agents.reload} title="AI unavailable" />
          ) : !agents.data ? (
            <LoadingRows rows={4} />
          ) : (
            <Table head={["Agent", "Purpose", "Provider", "Model", "Skills"]} minWidth="min-w-200">
              {agents.data.agents.map((a) => (
                <tr key={a.agent_id}>
                  <td className={`${tdClass} font-medium`}>{a.display_name}</td>
                  <td className={`${tdClass} text-muted`}>{a.purpose}</td>
                  <td className={tdClass}>{a.provider || "offline"}</td>
                  <td className={tdClass}>
                    <Mono>{a.model_id || "—"}</Mono>
                  </td>
                  <td className={tdClass}>
                    <span className="flex flex-wrap gap-1">{a.skills.map((s) => <Badge key={s}>{s}</Badge>)}</span>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      )}

      {tab === "security" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Panel title="Authentication">
            <Notice tone="warn" title="No authentication yet">
              {c?.auth.note ?? "Run on localhost only."} Every action is recorded in the audit log as <Mono>local-analyst (unauthenticated)</Mono>.
            </Notice>
          </Panel>
          <Panel title="Roles" aside={<SourceTag kind="planned">Proposed</SourceTag>}>
            <Table head={["Role", "Can"]} minWidth="min-w-80">
              {[
                ["Administrator", "Integrations, users, settings, everything an analyst can do"],
                ["Analyst", "Sync alerts, run investigations, record review decisions"],
                ["Read-only viewer", "View dashboards, alerts, cases and audit logs"],
              ].map(([r, d]) => (
                <tr key={r}>
                  <td className={`${tdClass} font-medium`}>{r}</td>
                  <td className={`${tdClass} text-muted`}>{d}</td>
                </tr>
              ))}
            </Table>
            <p className="m-0 text-xs text-subtle">Roles must be enforced by the backend once authentication exists, not only by hiding buttons.</p>
          </Panel>
        </div>
      )}

      {tab === "about" && (
        <Panel title="About Vigilance">
          <KeyValue
            items={[
              ["Version", <Mono>{c?.version ?? "0.1.0"}</Mono>],
              ["Project", "University Final Year Project: AI-assisted SIEM / SOAR on top of Wazuh"],
              ["Data path", "Dashboard → Vigilance FastAPI → Wazuh Manager / Indexer, PostgreSQL, VIGIL agents service"],
              ["Agents", "vigil-agents by Majdi Ahmadi (MIT), used with permission: Orchestrator, Triage, Malware, Hunter"],
              ["Safety", "Agents are read-only; reports always require analyst review; no response is executed"],
            ]}
          />
        </Panel>
      )}
    </>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Icon from "../../components/common/Icon";
import PageLoader from "../../components/common/PageLoader";
import Modal from "../../components/experience/Modal";
import Layout from "../../components/layout/Layout";
import LeaveForm, {
  LeaveFormReview,
  useLeaveWords,
} from "../../components/leave/LeaveForm";
import { useLanguage } from "../../context/LanguageContext";
import api from "../../api/client";
export default function MyLeaves() {
  const { t } = useLanguage(),
    l = useLeaveWords(),
    x = (key) => t(`common.experience.${key}`);
  const [open, setOpen] = useState(
      () => new URLSearchParams(window.location.search).get("new") === "1",
    ),
    [filter, setFilter] = useState("All"),
    [detail, setDetail] = useState("");
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["portal"],
    queryFn: () => api.get("/portal").then((r) => r.data),
  });
  const year = Number(
    new Intl.DateTimeFormat("en", {
      year: "numeric",
      timeZone: "Asia/Bangkok",
    }).format(new Date()),
  );
  const balances = (data?.leave_bals || []).filter(
      (b) => Number(b.year) === year,
    ),
    requests = [...(data?.leave_requests || [])].sort((a, b) =>
      (b.created_at || b.start_date || "").localeCompare(
        a.created_at || a.start_date || "",
      ),
    ),
    types = data?.leave_types || [],
    visible = requests.filter((r) => filter === "All" || r.status === filter),
    canRequest = !!data?.emp?.id && types.length > 0;
  return (
    <Layout
      title={t("common.interface.myLeaves")}
      subtitle={x("leaveSubtitle")}
    >
      {isLoading ? (
        <PageLoader />
      ) : isError ? (
        <div className="ux-empty">
          <Icon name="warning" />
          <p>{x("loadFailed")}</p>
          <button
            onClick={() => refetch()}
            className="ux-button ux-button-secondary"
          >
            {x("retry")}
          </button>
        </div>
      ) : (
        <>
          <div className="ux-section-toolbar">
            <div>
              <span className="uyf-eyebrow">{year}</span>
              <h2>{x("balance")}</h2>
            </div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              disabled={!canRequest}
              className="ux-button ux-button-primary"
            >
              <Icon name="plus" size={17} />
              {x("requestLeave")}
            </button>
          </div>
          {!canRequest && (
            <p className="ux-inline-note">
              {!data?.emp?.id ? x("noEmployee") : x("noTypes")}
            </p>
          )}
          <section className="ux-balance-grid" aria-label={x("balance")}>
            {balances.length ? (
              balances.map((b) => {
                const total = Number(b.total_days ?? b.entitled_days ?? 0),
                  used = Number(b.used_days ?? 0),
                  remaining = total - used,
                  paid =
                    types.find((t) => t.id === b.leave_type_id)?.is_paid !==
                    false,
                  pct = Math.max(0, Math.min(100, (used / (total || 1)) * 100));
                return (
                  <article className="ux-balance" key={b.id || b.leave_type_id}>
                    <div className="ux-balance-heading">
                      <span className="ux-result-icon">
                        <Icon name="leave" size={19} />
                      </span>
                      <h3>{b.type_name}</h3>
                      <span>{year}</span>
                    </div>
                    <p className="ux-balance-value">
                      {paid ? remaining : used}
                      <span>
                        {paid
                          ? x("daysRemaining")
                          : l(
                              "unpaid days taken",
                              "အသုံးပြုပြီး လစာမဲ့ခွင့်ရက်",
                            )}
                      </span>
                    </p>
                    {paid && (
                      <div
                        className="ux-progress"
                        role="meter"
                        aria-label={b.type_name}
                        aria-valuemin={0}
                        aria-valuemax={Math.max(total, 1)}
                        aria-valuenow={Math.min(used, Math.max(total, 1))}
                      >
                        <i style={{ width: `${pct}%` }} />
                      </div>
                    )}
                    <div className="ux-balance-meta">
                      <span>
                        {x("used")} <strong>{used}</strong>
                      </span>
                      <span>
                        {paid ? (
                          <>
                            {x("allowance")} <strong>{total}</strong>
                          </>
                        ) : (
                          l(
                            "No paid-leave balance",
                            "လစာပါခွင့်လက်ကျန် မသုံးပါ",
                          )
                        )}
                      </span>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="ux-empty ux-empty-inline">
                <Icon name="leave" />
                <p>{x("noBalances")}</p>
              </div>
            )}
          </section>
          <section className="uyf-panel ux-history">
            <div className="ux-section-toolbar">
              <div>
                <h2>{x("leaveHistory")}</h2>
                <p>{x("leaveHint")}</p>
              </div>
              <div
                className="ux-filter-chips"
                role="group"
                aria-label={x("filterStatus")}
              >
                {["All", "Pending", "Approved", "Rejected"].map((status) => (
                  <button
                    key={status}
                    type="button"
                    aria-pressed={filter === status}
                    onClick={() => setFilter(status)}
                  >
                    {status === "All" ? x("all") : x(status.toLowerCase())}
                    <span>
                      {status === "All"
                        ? requests.length
                        : requests.filter((r) => r.status === status).length}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {visible.length ? (
              <div className="ux-history-list">
                {visible.map((r) => (
                  <article className="ux-history-item" key={r.id}>
                    <span className="ux-history-icon">
                      <Icon name="leave" size={19} />
                    </span>
                    <div>
                      <h3>
                        {types.find((type) => type.id === r.leave_type_id)
                          ?.type_name ||
                          r.type_name ||
                          "—"}
                      </h3>
                      <p>
                        {r.start_date} <Icon name="arrowRight" size={12} />{" "}
                        {r.end_date}
                        {r.form_version === 2 &&
                          ` · ${r.working_days} ${l("days", "ရက်")} · ${r.session}`}
                      </p>
                      {r.reason && (
                        <p className="ux-history-reason">{r.reason}</p>
                      )}
                    </div>
                    <div className="ux-history-end">
                      <span
                        className={`ux-status ux-status-${(r.status || "").toLowerCase()}`}
                      >
                        {r.status === "Approved" && r.conditions
                          ? l(
                              "Approved with conditions",
                              "သတ်မှတ်ချက်ဖြင့် အတည်ပြုထား",
                            )
                          : ["Pending", "Approved", "Rejected"].includes(
                                r.status,
                              )
                            ? x(r.status.toLowerCase())
                            : r.status || "—"}
                      </span>
                      {r.form_version === 2 ? (
                        <button
                          className="leave-history-details"
                          onClick={() => setDetail(r.id)}
                        >
                          {l(
                            "Form, decision & PDF",
                            "Form၊ ဆုံးဖြတ်ချက်နှင့် PDF",
                          )}{" "}
                          ↗
                        </button>
                      ) : (
                        r.document_url && (
                          <a
                            href={r.document_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {x("attachment")} ↗
                          </a>
                        )
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="ux-empty">
                <Icon name="leave" size={29} />
                <h3>{requests.length ? x("noMatches") : x("noRequests")}</h3>
                <p>{x("leaveHint")}</p>
              </div>
            )}
          </section>
        </>
      )}
      {open && (
        <LeaveForm
          onClose={() => setOpen(false)}
          onSubmitted={(r) => setDetail(r.id)}
        />
      )}
      {detail && (
        <Modal
          open
          wide
          onClose={() => setDetail("")}
          title={l("Leave request", "ခွင့်တောင်းဆိုမှု")}
        >
          <div className="ux-modal-body">
            <LeaveFormReview id={detail} />
          </div>
        </Modal>
      )}
    </Layout>
  );
}

import { getPermitDataset } from "@/lib/permits";

// One row per permit block as the source printed it. Nothing is normalised for display:
// `permit_type_source` keeps the city's own vocabulary (`bnewconres`, `Resident Elect`), a printed
// `$0.00` renders as `$0.00`, and an unprinted valuation renders as "not printed" — absent and zero
// are different facts and the table keeps them different.
//
// Every row carries its own provenance: the report month links to the source PDF, and the document
// id and layout sit beneath it. Provenance is per row, never a footnote.
export function PermitRecordsTable() {
  const dataset = getPermitDataset();
  const rows = dataset.records.slice(0, dataset.rendered_row_count);

  return (
    <div data-testid="permit-records">
      <h3 className="text-base font-semibold">Records</h3>
      <p
        data-testid="permit-records-note"
        className="mt-2 text-sm text-black/70 dark:text-white/70"
      >
        {dataset.records_note}
      </p>

      <div className="mt-4 overflow-x-auto rounded-md border border-black/10 dark:border-white/15">
        <table className="w-full min-w-[64rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-black/10 text-xs uppercase tracking-wide text-black/50 dark:border-white/15 dark:text-white/50">
              <th scope="col" className="px-3 py-2 font-medium">Permit #</th>
              <th scope="col" className="px-3 py-2 font-medium">Date</th>
              <th scope="col" className="px-3 py-2 font-medium">Type</th>
              <th scope="col" className="px-3 py-2 font-medium">Description</th>
              <th scope="col" className="px-3 py-2 font-medium">Address</th>
              <th scope="col" className="px-3 py-2 font-medium">Valuation</th>
              <th scope="col" className="px-3 py-2 font-medium">Parcel</th>
              <th scope="col" className="px-3 py-2 font-medium">Report</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((record) => (
              <tr
                key={record.id}
                data-testid={`permit-row-${record.id}`}
                className="border-b border-black/5 align-top last:border-b-0 dark:border-white/10"
              >
                <td className="px-3 py-2 font-mono text-xs">{record.permit_number}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  {record.permit_date ?? (
                    <span className="text-black/50 dark:text-white/50">not printed</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {record.permit_type_source ?? (
                    <span className="text-black/50 dark:text-white/50">not printed</span>
                  )}
                </td>
                <td className="px-3 py-2 text-black/70 dark:text-white/70">
                  {record.purpose ?? (
                    <span className="text-black/50 dark:text-white/50">not printed</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {record.address_source ?? (
                    <span className="text-black/50 dark:text-white/50">not printed</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {record.total_cost ?? (
                    <span className="text-black/50 dark:text-white/50">not printed</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {record.matched_pin !== null ? (
                    <>
                      <span className="font-mono text-xs">{record.matched_pin}</span>
                      <span className="mt-0.5 block text-xs text-black/50 dark:text-white/50">
                        {record.match_method}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-black/50 dark:text-white/50">no parcel matched</span>
                      {record.unmatched_reason !== null && (
                        <span className="mt-0.5 block text-xs text-black/50 dark:text-white/50">
                          {record.unmatched_reason}
                        </span>
                      )}
                    </>
                  )}
                </td>
                <td className="px-3 py-2">
                  <a
                    href={record.report_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid={`permit-row-${record.id}-report`}
                    className="whitespace-nowrap underline underline-offset-2"
                  >
                    {record.report_month}
                  </a>
                  <span className="mt-0.5 block whitespace-nowrap text-xs text-black/50 dark:text-white/50">
                    doc {record.report_document_id} · {record.report_layout}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { notFound } from "next/navigation";
import { requireSession, AuthError } from "@/lib/auth/guards";
import { getRulesDocumentMeta, canViewRulesDocument } from "@/lib/services/tournamentDocument.service";
import { buttonSecondary } from "@/lib/ui";

const INLINE_RENDERABLE_MIME_TYPES = new Set(["application/pdf", "text/plain"]);

export default async function TournamentRulesReaderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();

  const allowed = await canViewRulesDocument(id, session.user);
  if (!allowed) {
    throw new AuthError("You do not have permission to view this document");
  }

  const document = await getRulesDocumentMeta(id);
  if (!document) notFound();

  const fileUrl = `/api/tournaments/${id}/rules`;
  const canRenderInline = INLINE_RENDERABLE_MIME_TYPES.has(document.mimeType);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 flex flex-col gap-4 h-[calc(100vh-4rem)]">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">{document.fileName}</h1>
          <p className="text-xs text-black/50 dark:text-white/50">
            Uploaded {document.uploadedAt.toDateString()}
          </p>
        </div>
        <a href={fileUrl} download={document.fileName} className={`${buttonSecondary} px-3 py-2 text-sm`}>
          Download
        </a>
      </div>

      {canRenderInline ? (
        <iframe
          src={fileUrl}
          title={document.fileName}
          className="flex-1 w-full rounded-xl border border-black/[0.08] dark:border-white/10 bg-white"
        />
      ) : (
        <div className="flex-1 flex items-center justify-center rounded-xl border border-black/[0.08] dark:border-white/10">
          <p className="text-sm text-black/60 dark:text-white/60">
            This file type can&apos;t be previewed in the browser — use Download above to open it.
          </p>
        </div>
      )}
    </div>
  );
}

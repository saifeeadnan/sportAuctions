"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createAuctionAction } from "@/lib/actions/auction.actions";
import { buttonPrimary, buttonSecondary } from "@/lib/ui";
import { WizardProgress } from "@/components/ui/WizardProgress";
import { IMPLEMENTED_AUCTION_TYPES, type AuctionType } from "@/lib/auctionTypes";
import {
  DEFAULT_ON_CLOCK_VISIBLE_FIELDS,
  type OnClockTemplate,
  type OnClockFieldKey,
} from "@/lib/onClockDisplay";
import { BasicsStep } from "@/components/admin/auctionWizard/BasicsStep";
import { CategoriesStep, type WizardCategory } from "@/components/admin/auctionWizard/CategoriesStep";
import { PlayerPoolStep, type WizardPlayer } from "@/components/admin/auctionWizard/PlayerPoolStep";
import { PreAuctionAndDisplayStep } from "@/components/admin/auctionWizard/PreAuctionAndDisplayStep";
import { ReviewStep } from "@/components/admin/auctionWizard/ReviewStep";

const STEP_LABELS = ["Basics", "Categories", "Player pool", "Pre-auction & display", "Review"];

export function NewAuctionWizard({
  tournamentId,
  players,
}: {
  tournamentId: string;
  players: WizardPlayer[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);

  const [name, setName] = useState("");
  const [teamBudget, setTeamBudget] = useState("");
  const [auctionType, setAuctionType] = useState<AuctionType>("LIVE");
  const [categories, setCategories] = useState<WizardCategory[]>([
    { name: "", basePrice: "", preAuctionEligible: true, bidIncrement: "" },
  ]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [overridden, setOverridden] = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState("All");

  const [skipPreAuctionDraft, setSkipPreAuctionDraft] = useState(false);
  const [onClockTemplate, setOnClockTemplate] = useState<OnClockTemplate>("CLASSIC");
  const [onClockVisibleFields, setOnClockVisibleFields] = useState<OnClockFieldKey[]>(
    DEFAULT_ON_CLOCK_VISIBLE_FIELDS
  );

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const categoryNames = categories.map((c) => c.name.trim()).filter(Boolean);

  // Pre-fill each player's category from their roster default as soon as a
  // matching category is defined, unless the admin has manually overridden it.
  useEffect(() => {
    setAssignments((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const p of players) {
        if (overridden.has(p.id) || !p.defaultCategory) continue;
        if (categoryNames.includes(p.defaultCategory) && next[p.id] !== p.defaultCategory) {
          next[p.id] = p.defaultCategory;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryNames.join("|")]);

  useEffect(() => {
    if (
      activeFilter !== "All" &&
      activeFilter !== "Unassigned" &&
      !categoryNames.includes(activeFilter)
    ) {
      setActiveFilter("All");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryNames.join("|")]);

  function assignPlayer(playerId: string, categoryName: string) {
    setOverridden((prev) => new Set(prev).add(playerId));
    setAssignments((prev) => ({ ...prev, [playerId]: categoryName }));
  }

  function updateCategory(index: number, field: "name" | "basePrice" | "bidIncrement", value: string) {
    setCategories((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  }

  function toggleCategoryPreAuctionEligible(index: number) {
    setCategories((prev) =>
      prev.map((c, i) => (i === index ? { ...c, preAuctionEligible: !c.preAuctionEligible } : c))
    );
  }

  function addCategory() {
    setCategories((prev) => [
      ...prev,
      { name: "", basePrice: "", preAuctionEligible: true, bidIncrement: "" },
    ]);
  }

  function removeCategory(index: number) {
    const removedName = categories[index].name.trim();
    setCategories((prev) => prev.filter((_, i) => i !== index));
    setAssignments((prev) => {
      const next = { ...prev };
      for (const [playerId, catName] of Object.entries(next)) {
        if (catName === removedName) delete next[playerId];
      }
      return next;
    });
  }

  const assignedPlayerCount = Object.values(assignments).filter(Boolean).length;

  // Lightweight, fail-fast UX gating only — createAuction's own service-layer
  // validation stays the real source of truth at submit time.
  const stepValid = [
    name.trim().length > 0 && Number(teamBudget) > 0 && IMPLEMENTED_AUCTION_TYPES.includes(auctionType),
    categories.some((c) => c.name.trim() && Number(c.basePrice) > 0),
    assignedPlayerCount > 0,
    true,
    true,
  ];

  async function handleSubmit() {
    setError(null);
    const playerAssignments = Object.entries(assignments)
      .filter(([, categoryName]) => categoryName)
      .map(([playerId, categoryName]) => ({ playerId, categoryName }));

    if (playerAssignments.length === 0) {
      setError("Assign at least one player to a category.");
      return;
    }

    setLoading(true);
    const result = await createAuctionAction({
      tournamentId,
      name,
      teamBudget: Number(teamBudget),
      auctionType,
      skipPreAuctionDraft,
      onClockTemplate,
      onClockVisibleFields,
      categories: categories
        .filter((c) => c.name.trim())
        .map((c) => ({
          name: c.name.trim(),
          basePrice: Number(c.basePrice),
          preAuctionEligible: c.preAuctionEligible,
          bidIncrement: c.bidIncrement.trim() ? Number(c.bidIncrement) : undefined,
        })),
      playerAssignments,
    });
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.push(`/admin/auctions/${result.data!.auctionId}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <WizardProgress steps={STEP_LABELS} currentStep={step} />

      {step === 0 && (
        <BasicsStep
          name={name}
          onNameChange={setName}
          teamBudget={teamBudget}
          onTeamBudgetChange={setTeamBudget}
          auctionType={auctionType}
          onAuctionTypeChange={setAuctionType}
        />
      )}

      {step === 1 && (
        <CategoriesStep
          categories={categories}
          onUpdateCategory={updateCategory}
          onToggleCategoryPreAuctionEligible={toggleCategoryPreAuctionEligible}
          onAddCategory={addCategory}
          onRemoveCategory={removeCategory}
        />
      )}

      {step === 2 && (
        <PlayerPoolStep
          players={players}
          categoryNames={categoryNames}
          assignments={assignments}
          onAssignPlayer={assignPlayer}
          activeFilter={activeFilter}
          onActiveFilterChange={setActiveFilter}
        />
      )}

      {step === 3 && (
        <PreAuctionAndDisplayStep
          skipPreAuctionDraft={skipPreAuctionDraft}
          onSkipPreAuctionDraftChange={setSkipPreAuctionDraft}
          onClockTemplate={onClockTemplate}
          onOnClockTemplateChange={setOnClockTemplate}
          onClockVisibleFields={onClockVisibleFields}
          onOnClockVisibleFieldsChange={setOnClockVisibleFields}
        />
      )}

      {step === 4 && (
        <ReviewStep
          name={name}
          teamBudget={teamBudget}
          auctionType={auctionType}
          categories={categories}
          assignedPlayerCount={assignedPlayerCount}
          totalPlayerCount={players.length}
          skipPreAuctionDraft={skipPreAuctionDraft}
          onClockTemplate={onClockTemplate}
          onClockVisibleFields={onClockVisibleFields}
          error={error}
          loading={loading}
          onSubmit={handleSubmit}
        />
      )}

      <div className="flex gap-2">
        {step > 0 && (
          <button type="button" onClick={() => setStep((s) => s - 1)} className={buttonSecondary}>
            Back
          </button>
        )}
        {step < STEP_LABELS.length - 1 && (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={!stepValid[step]}
            className={buttonPrimary}
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}

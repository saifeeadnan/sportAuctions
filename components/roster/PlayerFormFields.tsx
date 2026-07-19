import { inputClass } from "@/lib/ui";

export type PlayerFormDefaults = {
  name?: string;
  position?: string | null;
  age?: number | null;
  loginId?: string | null;
  defaultCategory?: string | null;
  previousTeam?: string | null;
  photoUrl?: string | null;
  rating?: string | null;
  battingRating?: string | null;
  bowlingRating?: string | null;
  fieldingRating?: string | null;
};

export function PlayerFormFields({ defaultValues = {} }: { defaultValues?: PlayerFormDefaults }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input name="name" required defaultValue={defaultValues.name ?? ""} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Position
          <input name="position" defaultValue={defaultValues.position ?? ""} className={inputClass} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Age
          <input
            name="age"
            type="number"
            defaultValue={defaultValues.age ?? ""}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Login ID
          <input name="loginId" defaultValue={defaultValues.loginId ?? ""} className={inputClass} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Default category
          <input
            name="defaultCategory"
            defaultValue={defaultValues.defaultCategory ?? ""}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Previous team
          <input
            name="previousTeam"
            defaultValue={defaultValues.previousTeam ?? ""}
            className={inputClass}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Photo URL
        <input name="photoUrl" defaultValue={defaultValues.photoUrl ?? ""} className={inputClass} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Rating
          <input
            name="rating"
            type="number"
            step="0.01"
            defaultValue={defaultValues.rating ?? ""}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Batting rating
          <input
            name="battingRating"
            type="number"
            step="0.01"
            defaultValue={defaultValues.battingRating ?? ""}
            className={inputClass}
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Bowling rating
          <input
            name="bowlingRating"
            type="number"
            step="0.01"
            defaultValue={defaultValues.bowlingRating ?? ""}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Fielding rating
          <input
            name="fieldingRating"
            type="number"
            step="0.01"
            defaultValue={defaultValues.fieldingRating ?? ""}
            className={inputClass}
          />
        </label>
      </div>
    </>
  );
}

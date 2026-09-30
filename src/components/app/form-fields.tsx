"use client";

import { Controller, type Control, type FieldPath, type FieldValues, type UseFormRegister } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const NONE = "__none__";

export function Field({ id, label, required, error, hint, className, children }: { id?: string; label: string; required?: boolean; error?: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
      {hint && !error ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextField<T extends FieldValues>({
  register,
  name,
  label,
  error,
  required,
  type = "text",
  hint,
  className,
  multiline,
  readOnly,
}: {
  register: UseFormRegister<T>;
  name: FieldPath<T>;
  label: string;
  error?: string;
  required?: boolean;
  type?: string;
  hint?: string;
  className?: string;
  multiline?: boolean;
  readOnly?: boolean;
}) {
  const id = `f-${String(name)}`;
  return (
    <Field id={id} label={label} required={required} error={error} hint={hint} className={className}>
      {multiline ? <Textarea id={id} rows={3} aria-invalid={Boolean(error)} readOnly={readOnly} {...register(name)} /> : <Input id={id} type={type} aria-invalid={Boolean(error)} readOnly={readOnly} {...register(name)} />}
    </Field>
  );
}

export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  options,
  error,
  required,
  allowEmpty,
  hint,
  className,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  options: { value: string; label: string }[];
  error?: string;
  required?: boolean;
  allowEmpty?: boolean;
  hint?: string;
  className?: string;
}) {
  const id = `f-${String(name)}`;
  return (
    <Field id={id} label={label} required={required} error={error} hint={hint} className={className}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Select value={(field.value as string | null) ?? (allowEmpty ? NONE : undefined)} onValueChange={(v) => field.onChange(v === NONE ? null : v)}>
            <SelectTrigger id={id} className="w-full" aria-invalid={Boolean(error)}>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {allowEmpty ? <SelectItem value={NONE}>—</SelectItem> : null}
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </Field>
  );
}

export function SwitchField<T extends FieldValues>({ control, name, label, hint }: { control: Control<T>; name: FieldPath<T>; label: string; hint?: string }) {
  const id = `f-${String(name)}`;
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className="flex items-start gap-3">
          <Switch id={id} checked={Boolean(field.value)} onCheckedChange={field.onChange} />
          <div>
            <Label htmlFor={id}>{label}</Label>
            {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
          </div>
        </div>
      )}
    />
  );
}

export function CheckboxList({ options, value, onChange, columns = 2 }: { options: { value: string; label: string; hint?: string }[]; value: string[]; onChange: (v: string[]) => void; columns?: number }) {
  return (
    <div className={cn("grid gap-2", columns === 2 ? "sm:grid-cols-2" : columns === 3 ? "sm:grid-cols-3" : "")}>
      {options.map((o) => (
        <label key={o.value} className="flex items-start gap-2 text-sm">
          <Checkbox checked={value.includes(o.value)} onCheckedChange={(c) => onChange(c ? [...value, o.value] : value.filter((v) => v !== o.value))} className="mt-0.5" />
          <span>
            {o.label}
            {o.hint ? <span className="block text-xs text-muted-foreground">{o.hint}</span> : null}
          </span>
        </label>
      ))}
    </div>
  );
}

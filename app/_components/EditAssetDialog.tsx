'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useActionState, useState } from 'react';
import { Button, Dialog, FormField, Input } from '@sovereignfs/ui';
import { MoneyInput } from './MoneyInput';
import { updateAsset } from '../actions';
import type { ActionResult } from '../_lib/action-result';
import type { AssetItem } from '../_lib/accounts';
import styles from './Accounts.module.css';

/** Revalue an asset (CONCEPT.md: asset values are updated by hand in v1) or rename it. */
export function EditAssetDialog({ asset, onClose }: { asset: AssetItem; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(asset.name);
  const [valueCents, setValueCents] = useState<number | null>(asset.valueMinor);

  const [state, dispatch, pending] = useActionState<ActionResult | null, undefined>(async () => {
    const result = await updateAsset({ assetId: asset.id, name, valueMinor: valueCents ?? 0 });
    if (result.ok) {
      router.refresh();
      onClose();
    }
    return result;
  }, null);

  return (
    <Dialog open onClose={onClose} size="sm" title="Edit asset" aria-label="Edit asset">
      <div className={styles.detailBody}>
        <FormField label="Name">
          {(field) => <Input {...field} value={name} onChange={(e) => setName(e.target.value)} />}
        </FormField>
        <FormField label={`Value (${asset.currency})`}>
          {(field) => (
            <MoneyInput
              currency={asset.currency}
              {...field}
              valueCents={valueCents}
              onValueChange={setValueCents}
            />
          )}
        </FormField>
        {state && !state.ok && <p className={styles.feedbackError}>{state.error}</p>}
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={() => startTransition(() => dispatch(undefined))}
            loading={pending}
            disabled={!name.trim() || valueCents === null || pending}
          >
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

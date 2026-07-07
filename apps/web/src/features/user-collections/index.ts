// User-collections feature — public surface.
//
// The Create-Collection flow (Feature 35): a reusable trigger button + its modal.
// CreateCollectionTrigger is the client island (owns open/close state and calls the
// mock-only `repositories.saved.createUserCollection` seam); CreateCollectionModal is the
// controlled dialog it renders. Both are `'use client'`.
//
// MOCK-ONLY: no backend, no app/api, no auth/session, no localStorage, no persistence.
export { CreateCollectionTrigger } from './CreateCollectionTrigger';
export type { CreateCollectionTriggerProps } from './CreateCollectionTrigger';

export { CreateCollectionModal } from './CreateCollectionModal';
export type { CreateCollectionModalProps } from './CreateCollectionModal';

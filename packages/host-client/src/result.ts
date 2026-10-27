export type HostFailure =
  | { readonly kind: 'offline'; readonly message: string }
  | { readonly kind: 'unauthorised' }
  | { readonly kind: 'protocol'; readonly message: string }
  | { readonly kind: 'http'; readonly status: number; readonly message: string }
  | { readonly kind: 'cancelled' };

export type HostResult<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'error'; readonly error: HostFailure };

export function failureMessage(error: HostFailure): string {
  switch (error.kind) {
    case 'offline':
    case 'protocol':
    case 'http': return error.message;
    case 'unauthorised': return 'The host connection is not authorised';
    case 'cancelled': return 'The host request was cancelled';
    default: {
      const exhaustive: never = error;
      return exhaustive;
    }
  }
}

<!-- This file is auto-generated. Do not edit manually. -->

# Background

## React 18 Strict Mode

Strict Mode enables the following development-only behaviors:

* Components will re-render an extra time to find bugs caused by impure rendering.
* Components will re-run Effects an extra time to find bugs caused by missing Effect cleanup.


### Lifecycle of a Component in Strict Mode:

1. Render phase is called
2. Render phase is called again
   * All state and refs of the second render is discarded and state and refs from the first is kept
3. Effect is called (mount)
4. Effect cleanup is called (unmount)
5. Effect is called again (mount)

## Not included in version 18 Strict Mode checks

* Components will re-run refs callbacks an extra time to find bugs caused by missing ref cleanup.

This is introduced in React 19 Strict Mode.

In React 18, refs callbacks are called once after the element is appended to the DOM (commit phase) and once when it is removed from the DOM (commit phase).


# Anti-patterns

## id: isolated-unsubscribe

* Problem: Subscribe and unsubscribe logic should be colocated to ensure they are always in sync.
* Solution: Place both subscribe and unsubscribe logic within the same function, to force contract. If a function creates a subscription and is not able to clean it up, it should return access to the subscription to the caller so they can handle cleanup.
* Why: Subscriptions that require cleanup should have their subscribe and unsubscribe logic colocated. If they are separated, React concurrent mode can lead to lost references and memory leaks.

Core Issue: Isolated Unsubscribe

The main pattern to detect is when unsubscribe happens in isolation (typically in a useEffect cleanup) without direct access to the subscription creation. This creates a dependency on shared state (refs, closures) that can get out of sync in concurrent mode.

Before classifying code as this pattern, ALL conditions must be met:

❌ Anti-pattern Conditions:

1. Subscription creation happens in a callback, function, or separate effect
2. Unsubscribe/cleanup happens in isolation (typically useEffect cleanup) using refs or shared state
3. The unsubscribe does NOT have direct access to the subscription object from creation
4. Both subscribe and unsubscribe exist but are not colocated

✅ Ok-as-is (not this pattern) Conditions (any of these):

* Subscribe and unsubscribe are in the same function/effect
* Unsubscribe has direct access to subscription object (no refs/shared state needed)
* No unsubscribe exists at all
* Code is not in React components/hooks
* Unsubscribe happens in same effect as subscribe (even if separate from creation)

### Anti-pattern: callback subscribes without returning subscription

❌ Issue - The subscribe/unsubscribe are split between the callback and the effect hook which will get out of sync in concurrent mode.

```tsx
const subscriptionRef = React.useRef<Subscription | null>(null);
const subscribeSomewhere = React.useCallback(() => {
  subscriptionRef.current = someService.subscribe((data) => {
    // ...
  });
}, []);
React.useEffect(() => {
  return () => subscriptionRef.current?.unsubscribe();
}, []);
```

✅ Solution - Have the callback return the subscription so the effect hook can clean it up.

```tsx
const subscribeSomewhere = React.useCallback(() => {
  return someService.subscribe((data) => {
    // ...
  });
}, []);

React.useEffect(() => {
  const subscription = subscribeSomewhere();
  return () => subscription.unsubscribe();
}, [subscribeSomewhere]);
```

### Anti-pattern: isolated unsubscribe in effect cleanup

❌ Issue - Unsubscribe happens in isolation using refs/shared state, separated from subscription creation.

```tsx
const subscriptionRef = React.useRef<Subscription | null>(null);

const handleSomething = React.useCallback(() => {
  // Subscription created here without returning it
  subscriptionRef.current = someService.subscribe(/*...*/);
}, []);

React.useEffect(() => {
  // Isolated unsubscribe - no direct access to subscription creation
  return () => subscriptionRef.current?.unsubscribe();
}, []);
```

✅ Solution - Have the callback return the subscription for direct cleanup.

```tsx
const subscribeToSomething = React.useCallback(() => {
  return someService.subscribe(/*...*/);
}, []);

React.useEffect(() => {
  const subscription = subscribeToSomething();
  return () => subscription.unsubscribe(); // Direct access to subscription
}, [subscribeToSomething]);
```

### Anti-pattern: subscription in one effect, cleanup in another

❌ Issue - Subscribe and unsubscribe are in different effects, relying on shared state.

```tsx
const subscriptionRef = React.useRef<Subscription | null>(null);

React.useEffect(() => {
  // Effect 1: Creates subscription
  subscriptionRef.current = someService.subscribe(/*...*/);
}, [someCondition]);

React.useEffect(() => {
  // Effect 2: Isolated cleanup
  return () => subscriptionRef.current?.unsubscribe();
}, []);
```

✅ Solution - Combine both in the same effect.

```tsx
React.useEffect(() => {
  const subscription = someService.subscribe(/*...*/);
  return () => subscription.unsubscribe(); // Colocated cleanup
}, [someCondition]);
```

### OK-Pattern: subscription and cleanup in separate effects with direct access


✅ OK as-is - Even though in separate effects, the cleanup effect has direct access to the subscription without refs.

```tsx
const [subscription, setSubscription] = React.useState<Subscription | null>(
  null
);

React.useEffect(() => {
  const sub = someService.subscribe(/*...*/);
  setSubscription(sub);
}, [someCondition]);

React.useEffect(() => {
  return () => {
    subscription?.unsubscribe(); // Direct access via state, not refs
    setSubscription(null);
  };
}, [subscription]);
```

### OK-Pattern: no cleanup exists


✅ OK as-is - No isolated unsubscribe pattern since there's no cleanup.

```tsx
const handleSomething = React.useCallback(() => {
  someService.subscribe(/*...*/); // No cleanup anywhere
}, []);
```


## id: subscribe-in-render-unsubscribe-in-effect-cleanup

* Problem: React component (or hook) render code (body or useMemo) should not create subscriptions (`.subscribe(...)` method invocation) that requires unsubscription (`.unsubscribe()` method invocation).
* Solution: Subscribe in effect hook AND unsubscribe in the SAME effect hook's cleanup function.
* Why: In React Concurrent mode, if you have a subscription that requires cleanup, both the subscription and its cleanup must be collocated in the same effect hook. If they are separated, React may call the render code multiple times without calling the cleanup, leading to memory leaks or unexpected behavior.

Before classifying code as this pattern, ALL conditions must be met:

❌ Anti-pattern Conditions:

1. Subscription happens in render code (component body or useMemo)
2. Unsubscription happens in an effect CLEANUP function (return statement)
3. Both subscription AND unsubscription methods exist in the code
4. The subscription and cleanup are SEPARATED (not in the same effect)

If ANY of these conditions are met, then it is NOT this pattern.

✅ Ok-as-is Conditions:

* No unsubscription method exists at all
* Unsubscription happens in effect body (not cleanup function)
* Subscription and unsubscription are already in the same effect and cleanup
* Only creation exists without cleanup, or only cleanup exists without creation

### Anti-pattern: Subscribe in render body and unsubscribe in effect cleanup

❌ Issue - The subscribe/unsubscribe are split between render code and effect cleanup code which will get out of sync in concurrent mode.

```tsx
const Component = () => {
  // ... render code
  subscriptionRef.current = someService.subscribe(/*...*/);
  // ... render code
  React.useEffect(() => {
    // or useLayoutEffect/useInsertionEffect
    return () => subscriptionRef.current?.unsubscribe();
  }, []);
};
```

✅ Solution - Move the subscription inside effect so the pairs of subscribe/unsubscribe are always matched.

```tsx
const Component = () => {
  // ... render code
  React.useEffect(() => {
    // or useLayoutEffect/useInsertionEffect
    subscriptionRef.current = someService.subscribe(/*...*/);
    return () => subscriptionRef.current?.unsubscribe();
  }, []);
};
```

### Anti-pattern: Subscribe in useMemo and unsubscribe in effect cleanup

❌ Issue - The subscribe/unsubscribe are split between useMemo and effect cleanup code which will get out of sync in concurrent mode.

```tsx
const Component = (props) => {
  // ... render code
  const subscription = React.useMemo(() => someService.subscribe(/*...*/), []);
  // ...
  // or useLayoutEffect/useInsertionEffect
  React.useEffect(() => {
    return () => subscription.unsubscribe();
  }, []);
};
```

✅ Solution - Move the subscription inside the same effect hook.

```tsx
const Component = (props) => {
  // or useLayoutEffect/useInsertionEffect
  React.useEffect(() => {
    const subscription = someService.subscribe(/*...*/);
    return () => subscription.unsubscribe();
  }, []);
};
```

### Anti-pattern: Subscription probably created in render, unsubscribe in effect cleanup

❌ Issue - Even if there's no direct call in render to a `.subscribe(...)` (in this case SomeService might be creating a subscription internally), the `.unsubscribe()` is still separated from the subscription creation which can lead to issues in concurrent mode.

```tsx
const Component = (props) => {
  // ... render code
  const someService = React.useMemo(() => new SomeService(/* ... */), []);
  // ...
  React.useEffect(() => {
    // or useLayoutEffect/useInsertionEffect
    return () => someService.unsubscribe();
  }, []);
};
```

✅ Solution - Move the subscribe and unsubscribe into the same effect hook.

```tsx
const Component = (props) => {
  // or useLayoutEffect/useInsertionEffect
  React.useEffect(() => {
    const someService = new SomeService(/* ... */);
    return () => someService.unsubscribe();
  }, []);
};
```

### OK-Pattern: Subscribe in body without unsubscribe


✅ OK as-is - The current code subscribes every render and is already called multiple times and has no clean up. Concurrent mode will not change its behavior.

```tsx
const Component = () => {
  someService.subscribe(/*...*/);
};
```

### OK-Pattern: Subscribe in useMemo without unsubscribe


✅ OK as-is - The current code subscribes twice in useMemo and has no clean up. Concurrent mode will not change its behavior.

```tsx
const Component = () => {
  React.useMemo(() => {
    someService.subscribe(/*...*/);
  }, []);
};
```

### OK-Pattern: Subscribe in render and unsubscribe in effect body


✅ OK as-is - The current code subscribes in render and unsubscribes in effect body. Although not ideal, concurrent mode will not lead to lost cleanups since the unsubscribe is not in cleanup function.

```tsx
const Component = () => {
  someService.subscribe(/*...*/);
  React.useEffect(() => {
    // or useLayoutEffect/useInsertionEffect
    someService.unsubscribe();
  }, []);
};
```


## id: timer-without-cleanup

* Problem: Timers such as requestAnimationFrame, setInterval, setImmediate, setTimeout or queueMicrotask should always be cleaned up to avoid memory leaks and unexpected behavior.
* Solution: Always store the timer handle and clean it up when no longer needed. Keep timer creation out of the render phase.
  1. it should never be on body nor in useMemo
  2. it should always have a cleanup
  3. it can be on a callback or on an effect, but if it's on a callback, the cleanup should be in the same callback or returned to the caller for cleanup.
* Why: Timers created without cleanup can lead to memory leaks and unexpected behavior, especially in React concurrent mode where components may be mounted and unmounted multiple times.

### Anti-pattern: timer created in render without cleanup

❌ Issue - Creating timers in the render phase without storing the handle or cleaning them up can lead to memory leaks and unexpected behavior.

```tsx
if (enableRAF) {
  host.requestAnimationFrame(() => {
    // ...
  });
}
```

✅ Solution - Create timer in effect hook, store the handle, and clean it up in the same effect hook.

```tsx
// or useLayoutEffect/useInsertionEffect
React.useEffect(() => {
  if (!enableRAF) return;

  const rafId = host.requestAnimationFrame(() => {
    // ...
  });

  return () => {
    host.cancelAnimationFrame(rafId);
  };
}, [enableRAF, host]);
```

### Anti-pattern: timer created in callback without cleanup

❌ Issue - Creating timers in a callback without storing the handle or cleaning them up can lead to memory leaks and unexpected behavior.

```tsx
const startRAF = React.useCallback(() => {
  if (enableRAF) {
    host.requestAnimationFrame(() => {
      // ...
    });
  }
}, [enableRAF, host]);
```

✅ Solution - Store the timer handle in the callback and provide a way to clean it up.

```tsx
const startRAF = React.useCallback(() => {
  if (!enableRAF) return;
  const rafId = host.requestAnimationFrame(() => {
    // ...
  });
  return () => {
    host.cancelAnimationFrame(rafId);
  };
}, [enableRAF, host]);
```



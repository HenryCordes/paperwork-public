# React Query Migration Documentation

## Overview
This document outlines the approach, methodology, and lessons learned during the migration from Redux to React Query for server-state management in the Paperwork application.

## Migration Strategy

### Step 1: Query Key Centralization
All query keys are centralized in a single `queryKeys.js` file for consistency and easier cache management. This provides a single source of truth for query identifiers across the application.

```javascript
// Example from queryKeys.js
export const queryKeys = {
  contacts: {
    all: ['contacts'],
    lists: () => [...queryKeys.contacts.all, 'list'],
    list: (filters) => [...queryKeys.contacts.lists(), filters],
    details: () => [...queryKeys.contacts.all, 'detail'],
    detail: (id) => [...queryKeys.contacts.details(), id],
  },
  emails: {
    all: ['emails'],
    lists: () => [...queryKeys.emails.all, 'list'],
    list: (filters) => [...queryKeys.emails.lists(), filters],
    details: () => [...queryKeys.emails.all, 'detail'],
    detail: (id) => [...queryKeys.emails.details(), id],
  },
  // Additional domains follow the same pattern
};
```

### Step 2: Creating React Query Hooks
For each domain, we created dedicated hook files implementing:
- List fetching with filtering/pagination support
- Individual item fetching by ID
- Create/update mutations with appropriate cache invalidation
- Delete mutations with cache invalidation
- Specialized operations (e.g., sending emails) with appropriate error handling

```javascript
// Example hook structure
export const useEmails = (queryString = '') => {
  return useQuery({
    queryKey: queryKeys.emails.list(queryString),
    queryFn: () => apiService.getEmails(queryString),
  });
};

export const useEmail = (id, options = {}) => {
  return useQuery({
    queryKey: queryKeys.emails.detail(id),
    queryFn: () => apiService.getEmail(id),
    ...options,
  });
};

export const useCreateOrUpdateEmail = () => {
  const queryClient = useQueryClient();
  const dispatch = useDispatch();
  
  return useMutation({
    mutationFn: (data) => apiService.createOrUpdateEmail(data),
    onSuccess: (data) => {
      // Invalidate both lists and the specific item
      queryClient.invalidateQueries({ queryKey: queryKeys.emails.lists() });
      if (data._id) {
        queryClient.invalidateQueries({ 
          queryKey: queryKeys.emails.detail(data._id) 
        });
      }
      dispatch(setAlert('Email opgeslagen!', 'success'));
    },
    onError: (error) => {
      dispatch(setAlert(`Fout bij opslaan email: ${error.message}`, 'danger'));
    },
  });
};
```

### Step 3: UI Component Integration
- Each component that previously used Redux for data fetching was refactored to use React Query hooks
- Loading states are explicitly handled using `isLoading`, `isError`, and `error` properties
- Success messages are displayed using the mutation's `isSuccess` property
- Page-specific pagination, filtering, and sorting directly integrated with query parameters

### Step 4: Maintaining Redux for Alerts
During this transitional phase, we continued to use Redux for global alert notifications:
- Each mutation hook uses `useDispatch()` to dispatch alert actions on success/failure
- This approach provides a graceful transition path while maintaining consistent user feedback

## Lessons Learned

### What Worked Well

1. **Centralized Query Keys** 
   - Consistent naming pattern made cache invalidation more predictable
   - Hierarchical structure allowed for targeted or broad invalidation as needed

2. **Specialized Hooks per Domain**
   - Encapsulation of API logic simplified component code
   - Re-usable hooks reduced duplicated data fetching code
   - Domain-specific hooks made integration easier across multiple components

3. **Cache Invalidation Patterns**
   - Invalidating both list queries and detail queries after mutations kept data consistent
   - Automatic refetching after mutations reduced manual refetch code

4. **Loading/Error State Handling**
   - React Query's built-in loading/error states made UI feedback more consistent
   - Better user experience with explicit loading indicators and error messages

5. **Mixed Redux/React Query Approach**
   - Keeping alerts in Redux allowed for incremental migration
   - Focus on server-state first provided clear boundaries

### Challenges and Solutions

1. **Challenge**: Properly invalidating related data after mutations
   **Solution**: Hierarchical query key structure allowed invalidating entire categories

2. **Challenge**: Alert handling for mutations
   **Solution**: Using `useDispatch()` within mutation hooks to trigger Redux actions

3. **Challenge**: UI components disappearing during loading states
   **Solution**: Keep UI components mounted, show loading indicators without replacing content

4. **Challenge**: Form integration with React Query
   **Solution**: Combine React Hook Form with React Query mutations for better form handling

5. **Challenge**: Search and filtering
   **Solution**: Use state variables to build query strings and pass them to query hooks

## Next Steps for Future Domain Migrations

1. Always start with centralizing query keys in `queryKeys.js`
2. Create domain-specific hook files with consistent patterns
3. Implement cache invalidation for both lists and individual items
4. Integrate hooks into components with proper loading/error handling
5. Ensure alert notifications are properly dispatched from mutation hooks
6. Test thoroughly, especially cache invalidation and component re-renders

## Future Considerations

- Consider migrating UI state from Redux to React Context where appropriate
- Explore React Query's built-in prefetching for improved UX
- Look into optimistic updates for faster perceived performance
- Consider dedicated error boundary components to better handle API errors

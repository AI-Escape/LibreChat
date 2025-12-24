import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, dataService, EModelEndpoint, PermissionBits } from 'librechat-data-provider';
import type {
  QueryObserverResult,
  UseQueryOptions,
  UseInfiniteQueryOptions,
} from '@tanstack/react-query';
import type t from 'librechat-data-provider';
import { useMemo } from 'react';
import { isEphemeralAgent } from '~/common';

/**
 * AGENTS
 */
export const defaultAgentParams: t.AgentListParams = {
  limit: 10,
  requiredPermission: PermissionBits.EDIT,
};
/**
 * Hook for getting all available tools for A
 */
export const useAvailableAgentToolsQuery = (): QueryObserverResult<t.TPlugin[]> => {
  const queryClient = useQueryClient();
  const endpointsConfig = queryClient.getQueryData<t.TEndpointsConfig>([QueryKeys.endpoints]);

  const enabled = !!endpointsConfig?.[EModelEndpoint.agents];
  return useQuery<t.TPlugin[]>([QueryKeys.tools], () => dataService.getAvailableAgentTools(), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    enabled,
  });
};

/**
 * Hook for listing all Agents, with optional parameters provided for pagination and sorting
 */
export const useListAgentsQuery = <TData = t.AgentListResponse>(
  params: t.AgentListParams = defaultAgentParams,
  config?: UseQueryOptions<t.AgentListResponse, unknown, TData>,
): QueryObserverResult<TData> => {
  const queryClient = useQueryClient();
  const endpointsConfig = queryClient.getQueryData<t.TEndpointsConfig>([QueryKeys.endpoints]);

  const enabled = !!endpointsConfig?.[EModelEndpoint.agents];
  return useQuery<t.AgentListResponse, unknown, TData>(
    [QueryKeys.agents, params],
    () => dataService.listAgents(params),
    {
      // Example selector to sort them by created_at
      // select: (res) => {
      //   return res.data.sort((a, b) => a.created_at - b.created_at);
      // },
      staleTime: 1000 * 5,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
      enabled: config?.enabled !== undefined ? config.enabled && enabled : enabled,
    },
  );
};

/**
 * Hook for retrieving basic details about a single agent (VIEW permission)
 */
export const useGetAgentByIdQuery = (
  agent_id: string | null | undefined,
  config?: UseQueryOptions<t.Agent>,
): QueryObserverResult<t.Agent> => {
  const isValidAgentId = !!agent_id && !isEphemeralAgent(agent_id);

  return useQuery<t.Agent>(
    [QueryKeys.agent, agent_id],
    () =>
      dataService.getAgentById({
        agent_id: agent_id as string,
      }),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      enabled: isValidAgentId && (config?.enabled ?? true),
      ...config,
    },
  );
};




const BASE_REFETCH_INTERVAL = 5000;
const calculateJitter = (conversationId?: string | null) => {
  if (!conversationId) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < conversationId.length; i++) {
    sum = (sum + conversationId.charCodeAt(i)) % 100000;
  }
  return sum % 1000;
};

/**
 * Hook: Agent run status by conversationId
 */
export const useAgentRunStatusQuery = (
  conversationId?: string | null,
  config?: UseQueryOptions<{ running: boolean }>,
): QueryObserverResult<{ running: boolean }> => {
  const enabled = typeof conversationId === 'string' && !!conversationId;
  const jitter = useMemo(() => calculateJitter(conversationId), [conversationId]);
  return useQuery<{ running: boolean }>(
    [QueryKeys.agent, 'runStatus', conversationId],
    () => dataService.getAgentRunStatus(conversationId as string),
    {
      // Poll less frequently, pause when tab is hidden, and stop polling when not running.
      // Add small jitter per convo to de-sync bursts across many icons.
      refetchInterval: (data) => {
        if (document.visibilityState !== 'visible') {
          return false;
        }
        // if not running, wait 2x longer to check again
        if (!data?.running) {
          return 2 * BASE_REFETCH_INTERVAL + jitter;
        }
        return BASE_REFETCH_INTERVAL + jitter;
      },
      refetchOnWindowFocus: true,
      refetchIntervalInBackground: false,
      refetchOnReconnect: true,
      retry: false,
      enabled,
      staleTime: 10000,
      ...config,
    },
  );
};
/**
 * Hook for retrieving full agent details including sensitive configuration (EDIT permission)
 */
export const useGetExpandedAgentByIdQuery = (
  agent_id: string,
  config?: UseQueryOptions<t.Agent>,
): QueryObserverResult<t.Agent> => {
  return useQuery<t.Agent>(
    [QueryKeys.agent, agent_id, 'expanded'],
    () =>
      dataService.getExpandedAgentById({
        agent_id,
      }),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      retry: false,
      ...config,
    },
  );
};

/**
 * MARKETPLACE
 */
/**
 * Hook for getting agent categories for marketplace tabs
 */
export const useGetAgentCategoriesQuery = (
  config?: UseQueryOptions<t.TMarketplaceCategory[]>,
): QueryObserverResult<t.TMarketplaceCategory[]> => {
  return useQuery<t.TMarketplaceCategory[]>(
    [QueryKeys.agentCategories],
    () => dataService.getAgentCategories(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      staleTime: 5 * 60 * 1000, // Cache for 5 minutes
      ...config,
    },
  );
};

/**
 * Hook for infinite loading of marketplace agents with cursor-based pagination
 */
export const useMarketplaceAgentsInfiniteQuery = (
  params: {
    requiredPermission: number;
    category?: string;
    search?: string;
    limit?: number;
    promoted?: 0 | 1;
    cursor?: string; // For pagination
  },
  config?: UseInfiniteQueryOptions<t.AgentListResponse, unknown>,
) => {
  return useInfiniteQuery<t.AgentListResponse>({
    queryKey: [QueryKeys.marketplaceAgents, params],
    queryFn: ({ pageParam }) => {
      const queryParams = { ...params };
      if (pageParam) {
        queryParams.cursor = pageParam.toString();
      }
      return dataService.getMarketplaceAgents(queryParams);
    },
    getNextPageParam: (lastPage) => lastPage?.after ?? undefined,
    enabled: !!params.requiredPermission,
    keepPreviousData: true,
    staleTime: 2 * 60 * 1000, // 2 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
  });
};

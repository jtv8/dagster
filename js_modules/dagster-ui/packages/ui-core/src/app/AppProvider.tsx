import {
  ApolloClient,
  ApolloLink,
  ApolloProvider,
  HttpLink,
  InMemoryCache,
  split,
} from '@apollo/client';
import {WebSocketLink} from '@apollo/client/link/ws';
import {getMainDefinition} from '@apollo/client/utilities';
import {CustomTooltipProvider} from '@dagster-io/ui-components';
import * as React from 'react';
import {BrowserRouter} from 'react-router-dom';
import {CompatRouter} from 'react-router-dom-v5-compat';
import {SubscriptionClient} from 'subscriptions-transport-ws';

import {AppContext} from './AppContext';
import {CustomAlertProvider} from './CustomAlertProvider';
import {CustomConfirmationProvider} from './CustomConfirmationProvider';
import {DagsterPlusLaunchPromotion} from './DagsterPlusLaunchPromotion';
import {GlobalStyleProvider} from './GlobalStyleProvider';
import {LayoutProvider} from './LayoutProvider';
import {PermissionsProvider} from './Permissions';
import {patchCopyToRemoveZeroWidthUnderscores} from './Util';
import {WebSocketProvider} from './WebSocketProvider';
import {AnalyticsContext, dummyAnalytics} from './analytics';
import {migrateLocalStorageKeys} from './migrateLocalStorageKeys';
import {TimeProvider} from './time/TimeContext';
import {AssetLiveDataProvider} from '../asset-data/AssetLiveDataProvider';
import {AssetRunLogObserver} from '../asset-graph/AssetRunLogObserver';
import {DeploymentStatusProvider, DeploymentStatusType} from '../instance/DeploymentStatusProvider';
import {InstancePageContext} from '../instance/InstancePageContext';
import {PerformancePageNavigationListener} from '../performance';
import {JobFeatureProvider} from '../pipelines/JobFeatureContext';
import {WorkspaceProvider} from '../workspace/WorkspaceContext';
import './blueprint.css';

// The solid sidebar and other UI elements insert zero-width spaces so solid names
// break on underscores rather than arbitrary characters, but we need to remove these
// when you copy-paste so they don't get pasted into editors, etc.
patchCopyToRemoveZeroWidthUnderscores();

export interface AppProviderProps {
  children: React.ReactNode;
  appCache: InMemoryCache;
  config: {
    apolloLinks: ApolloLink[];
    basePath?: string;
    headers?: {[key: string]: string};
    origin: string;
    telemetryEnabled?: boolean;
    statusPolling: Set<DeploymentStatusType>;
  };
}

export const AppProvider = (props: AppProviderProps) => {
  const {appCache, config} = props;
  const {
    apolloLinks,
    basePath = '',
    headers = {},
    origin,
    telemetryEnabled = false,
    statusPolling,
  } = config;

  // todo dish: Change `deleteExisting` to true soon. (Current: 1.4.5)
  React.useEffect(() => {
    migrateLocalStorageKeys({from: /DAGIT_FLAGS/g, to: 'DAGSTER_FLAGS', deleteExisting: false});
    migrateLocalStorageKeys({from: /:dagit/gi, to: ':dagster', deleteExisting: false});
    migrateLocalStorageKeys({from: /^dagit(\.v2)?/gi, to: 'dagster', deleteExisting: false});
  }, []);

  const graphqlPath = `${basePath}/graphql`;
  const rootServerURI = `${origin}${basePath}`;
  const websocketURI = `${rootServerURI.replace(/^http/, 'ws')}/graphql`;

  // Ensure that we use the same `headers` value.
  const headersAsString = JSON.stringify(headers);
  const headerObject = React.useMemo(() => JSON.parse(headersAsString), [headersAsString]);

  const websocketClient = React.useMemo(
    () =>
      new SubscriptionClient(websocketURI, {
        reconnect: true,
        connectionParams: {...headerObject},
      }),
    [headerObject, websocketURI],
  );

  const apolloClient = React.useMemo(() => {
    // Subscriptions use WebSocketLink, queries & mutations use HttpLink.
    const splitLink = split(
      ({query}) => {
        const definition = getMainDefinition(query);
        return definition.kind === 'OperationDefinition' && definition.operation === 'subscription';
      },
      new WebSocketLink(websocketClient),
      new HttpLink({uri: graphqlPath, headers: headerObject}),
    );

    return new ApolloClient({
      cache: appCache,
      link: ApolloLink.from([...apolloLinks, splitLink]),
      defaultOptions: {
        watchQuery: {
          fetchPolicy: 'cache-and-network',
        },
      },
    });
  }, [apolloLinks, appCache, graphqlPath, headerObject, websocketClient]);

  const appContextValue = React.useMemo(
    () => ({
      basePath,
      rootServerURI,
      telemetryEnabled,
    }),
    [basePath, rootServerURI, telemetryEnabled],
  );

  const analytics = React.useMemo(() => dummyAnalytics(), []);
  const instancePageValue = React.useMemo(
    () => ({
      pageTitle: 'Deployment',
      healthTitle: 'Daemons',
    }),
    [],
  );

  return (
    <AppContext.Provider value={appContextValue}>
      <WebSocketProvider websocketClient={websocketClient}>
        <GlobalStyleProvider />
        <ApolloProvider client={apolloClient}>
          <AssetLiveDataProvider>
            <PermissionsProvider>
              <BrowserRouter basename={basePath || ''}>
                <CompatRouter>
                  <PerformancePageNavigationListener />
                  <TimeProvider>
                    <WorkspaceProvider>
                      <DeploymentStatusProvider include={statusPolling}>
                        <CustomConfirmationProvider>
                          <AnalyticsContext.Provider value={analytics}>
                            <InstancePageContext.Provider value={instancePageValue}>
                              <JobFeatureProvider>
                                <LayoutProvider>
                                  <DagsterPlusLaunchPromotion />
                                  {props.children}
                                </LayoutProvider>
                              </JobFeatureProvider>
                            </InstancePageContext.Provider>
                          </AnalyticsContext.Provider>
                        </CustomConfirmationProvider>
                        <CustomTooltipProvider />
                        <CustomAlertProvider />
                        <AssetRunLogObserver />
                      </DeploymentStatusProvider>
                    </WorkspaceProvider>
                  </TimeProvider>
                </CompatRouter>
              </BrowserRouter>
            </PermissionsProvider>
          </AssetLiveDataProvider>
        </ApolloProvider>
      </WebSocketProvider>
    </AppContext.Provider>
  );
};

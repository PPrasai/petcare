import { createContext, useContext } from 'react';
import type { Services } from '../../application/services';

const ServicesContext = createContext<Services | null>(null);

export const ServicesProvider = ServicesContext.Provider;

/** The use-case services, provided once by the app layer. */
export function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('ServicesProvider is missing');
  return services;
}

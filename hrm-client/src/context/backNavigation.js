import {createContext,useContext} from 'react';
export const BackNavigationContext=createContext(null);
export const useBackNavigation=()=>useContext(BackNavigationContext);

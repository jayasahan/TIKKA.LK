import React, { createContext, useContext, useEffect, useState } from "react";
import { customerService } from "../../services/customer.js";

const CustomerAuthContext = createContext(null);

export function CustomerAuthProvider({ children }) {
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    customerService.session()
      .then((payload) => { if (active) setCustomer(payload.customer || null); })
      .catch(() => { if (active) setCustomer(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <CustomerAuthContext.Provider value={{ customer, loading, setCustomer }}>
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth() {
  return useContext(CustomerAuthContext);
}

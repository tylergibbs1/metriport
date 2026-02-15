import { Patient } from "@metriport/core/domain/patient";
import { NextFunction, Request, Response } from "express";
import { getPatientOrFail } from "../../command/medical/patient/get-patient";
import { getUUIDFrom } from "../schemas/uuid";
import { getCxIdOrFail } from "../util";

/**
 * Validates the customer has access to the patient and adds the patient and related info to the
 * request.
 */
export function patientAuthorization(
  context: "query" | "params" = "params"
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  return async (req: Request, _: Response, next: NextFunction): Promise<void> => {
    const cxId = getCxIdOrFail(req);
    const patientId =
      context === "query"
        ? getUUIDFrom("query", req, "patientId").orFail()
        : getUUIDFrom("params", req, "id").orFail();

    const patient = await getPatientOrFail({ id: patientId, cxId });

    req.patient = patient;
    req.cxId = cxId;
    req.id = patientId;

    next();
  };
}

/**
 * Returns the patient, cxId, and id from the request, throwing an error if any are missing.
 */
export function getPatientInfoOrFail(req: Request): {
  patient: Patient;
  cxId: string;
  id: string;
} {
  const { patient, cxId, id } = { patient: req.patient, cxId: req.cxId, id: req.id };
  if (!patient || !cxId || !id) {
    throw new Error("Missing patient information in request");
  }
  return { patient, cxId, id };
}

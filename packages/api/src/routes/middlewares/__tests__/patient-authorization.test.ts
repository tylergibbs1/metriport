import { Patient } from "@metriport/core/domain/patient";
import { faker } from "@faker-js/faker";
import { BadRequestError, NotFoundError } from "@metriport/shared";
import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import * as getPatientModule from "../../../command/medical/patient/get-patient";
import { errorHandler } from "../../helpers/default-error-handler";
import { getPatientInfoOrFail, patientAuthorization } from "../patient-authorization";
import * as utilModule from "../../util";

const INVALID_UUID = "not-a-valid-uuid";

function mockRequest(overrides: Partial<Request> = {}): Request {
  return {
    cxId: faker.string.uuid(),
    params: {},
    query: {},
    header: jest.fn(),
    setHeader: jest.fn(),
    ...overrides,
  } as unknown as Request;
}

function mockResponse(): Response {
  return {
    setHeader: jest.fn(),
    contentType: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    send: jest.fn(),
  } as unknown as Response;
}

function makePatient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: faker.string.uuid(),
    cxId: faker.string.uuid(),
    facilityIds: [faker.string.uuid()],
    data: {},
    ...overrides,
  } as Patient;
}

function runMiddlewareAndErrorHandler(
  middleware: (req: Request, res: Response, next: NextFunction) => void | Promise<void>,
  req: Request,
  res: Response
): Promise<void> {
  const nextFn = jest.fn() as unknown as NextFunction;
  return (async () => {
    try {
      await Promise.resolve(middleware(req, res, nextFn));
    } catch (err) {
      errorHandler(err as Error, req, res, nextFn);
    }
    const nextErr = (nextFn as jest.Mock).mock.calls[0]?.[0];
    if (nextErr) {
      errorHandler(nextErr as Error, req, res, jest.fn() as NextFunction);
    }
  })();
}

describe("patientAuthorization", () => {
  let getCxIdOrFailSpy: jest.SpyInstance;
  let getPatientOrFailSpy: jest.SpyInstance;

  beforeAll(() => {
    getCxIdOrFailSpy = jest.spyOn(utilModule, "getCxIdOrFail");
    getPatientOrFailSpy = jest.spyOn(getPatientModule, "getPatientOrFail");
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe("params context (id from path)", () => {
    it("sets req.patient, req.cxId, req.id and calls next when params.id and cxId are valid", async () => {
      const cxId = faker.string.uuid();
      const patientId = faker.string.uuid();
      const patient = makePatient({ id: patientId, cxId });
      getCxIdOrFailSpy.mockReturnValue(cxId);
      getPatientOrFailSpy.mockResolvedValue(patient);

      const req = mockRequest({
        cxId,
        params: { id: patientId },
        query: {},
      });
      const res = mockResponse();
      const nextFn = jest.fn() as unknown as NextFunction;

      await patientAuthorization("params")(req, res, nextFn);

      expect(getPatientOrFailSpy).toHaveBeenCalledWith({ id: patientId, cxId });
      expect(req.patient).toBe(patient);
      expect(req.cxId).toBe(cxId);
      expect(req.id).toBe(patientId);
      expect(nextFn).toHaveBeenCalledWith();
    });

    it("returns 400 when cxId is missing", async () => {
      getCxIdOrFailSpy.mockImplementation(() => {
        throw new BadRequestError("Missing cxId");
      });
      const req = mockRequest({
        cxId: undefined,
        params: { id: faker.string.uuid() },
        query: {},
      });
      const res = mockResponse();

      await runMiddlewareAndErrorHandler(patientAuthorization("params"), req, res);

      expect(res.status).toHaveBeenCalledWith(httpStatus.BAD_REQUEST);
      expect(getPatientOrFailSpy).not.toHaveBeenCalled();
    });

    it("returns 400 when params.id is invalid UUID", async () => {
      const req = mockRequest({
        params: { id: INVALID_UUID },
        query: {},
      });
      const res = mockResponse();

      await runMiddlewareAndErrorHandler(patientAuthorization("params"), req, res);

      expect(res.status).toHaveBeenCalledWith(httpStatus.BAD_REQUEST);
      expect(getPatientOrFailSpy).not.toHaveBeenCalled();
    });

    it("returns 400 when params.id is missing", async () => {
      const req = mockRequest({ params: {}, query: {} });
      const res = mockResponse();

      await runMiddlewareAndErrorHandler(patientAuthorization("params"), req, res);

      expect(res.status).toHaveBeenCalledWith(httpStatus.BAD_REQUEST);
      expect(getPatientOrFailSpy).not.toHaveBeenCalled();
    });

    it("returns 404 when getPatientOrFail throws NotFoundError", async () => {
      const cxId = faker.string.uuid();
      const patientId = faker.string.uuid();
      getCxIdOrFailSpy.mockReturnValue(cxId);
      getPatientOrFailSpy.mockRejectedValue(
        new NotFoundError("Could not find patient", undefined, { id: patientId })
      );

      const req = mockRequest({
        cxId,
        params: { id: patientId },
        query: {},
      });
      const res = mockResponse();

      await runMiddlewareAndErrorHandler(patientAuthorization("params"), req, res);

      expect(res.status).toHaveBeenCalledWith(httpStatus.NOT_FOUND);
    });
  });

  describe("query context (patientId from query)", () => {
    it("sets req.patient, req.cxId, req.id and calls next when query.patientId and cxId are valid", async () => {
      const cxId = faker.string.uuid();
      const patientId = faker.string.uuid();
      const patient = makePatient({ id: patientId, cxId });
      getCxIdOrFailSpy.mockReturnValue(cxId);
      getPatientOrFailSpy.mockResolvedValue(patient);

      const req = mockRequest({
        cxId,
        params: {},
        query: { patientId },
      });
      const res = mockResponse();
      const nextFn = jest.fn() as unknown as NextFunction;

      await patientAuthorization("query")(req, res, nextFn);

      expect(getPatientOrFailSpy).toHaveBeenCalledWith({ id: patientId, cxId });
      expect(req.patient).toBe(patient);
      expect(req.cxId).toBe(cxId);
      expect(req.id).toBe(patientId);
      expect(nextFn).toHaveBeenCalledWith();
    });

    it("returns 400 when query.patientId is invalid UUID", async () => {
      const req = mockRequest({
        params: {},
        query: { patientId: INVALID_UUID },
      });
      const res = mockResponse();

      await runMiddlewareAndErrorHandler(patientAuthorization("query"), req, res);

      expect(res.status).toHaveBeenCalledWith(httpStatus.BAD_REQUEST);
      expect(getPatientOrFailSpy).not.toHaveBeenCalled();
    });

    it("returns 400 when query.patientId is missing", async () => {
      const req = mockRequest({ params: {}, query: {} });
      const res = mockResponse();

      await runMiddlewareAndErrorHandler(patientAuthorization("query"), req, res);

      expect(res.status).toHaveBeenCalledWith(httpStatus.BAD_REQUEST);
      expect(getPatientOrFailSpy).not.toHaveBeenCalled();
    });
  });
});

describe("getPatientInfoOrFail", () => {
  it("returns patient, cxId, and id when all are set on request", () => {
    const patient = makePatient();
    const cxId = faker.string.uuid();
    const id = faker.string.uuid();
    const req = mockRequest({
      patient: patient as Request["patient"],
      cxId,
      id,
    });

    const result = getPatientInfoOrFail(req);

    expect(result).toEqual({ patient, cxId, id });
  });

  it("throws when patient is missing", () => {
    const req = mockRequest({
      patient: undefined,
      cxId: faker.string.uuid(),
      id: faker.string.uuid(),
    });

    expect(() => getPatientInfoOrFail(req)).toThrow("Missing patient information");
  });

  it("throws when cxId is missing", () => {
    const req = mockRequest({
      patient: makePatient() as Request["patient"],
      cxId: undefined,
      id: faker.string.uuid(),
    });

    expect(() => getPatientInfoOrFail(req)).toThrow("Missing patient information");
  });

  it("throws when id is missing", () => {
    const req = mockRequest({
      patient: makePatient() as Request["patient"],
      cxId: faker.string.uuid(),
      id: undefined,
    });

    expect(() => getPatientInfoOrFail(req)).toThrow("Missing patient information");
  });
});

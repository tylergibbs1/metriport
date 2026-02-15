import { faker } from "@faker-js/faker";
import { BadRequestError, NotFoundError } from "@metriport/shared";
import { Facility } from "../../../domain/medical/facility";
import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import * as getFacilityModule from "../../../command/medical/facility/get-facility";
import { errorHandler } from "../../helpers/default-error-handler";
import { facilityAuthorization, getFacilityInfoOrFail } from "../facility-authorization";
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

function makeFacility(overrides: Partial<Facility> = {}): Facility {
  return {
    id: faker.string.uuid(),
    cxId: faker.string.uuid(),
    oid: faker.string.alphanumeric(10),
    facilityNumber: faker.number.int(),
    data: {
      name: "Test",
      npi: "123",
      tin: "456",
      address: {} as Facility["data"]["address"],
    },
    ...overrides,
  } as Facility;
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

describe("facilityAuthorization", () => {
  let getCxIdOrFailSpy: jest.SpyInstance;
  let getFacilityOrFailSpy: jest.SpyInstance;

  let originalGetCxIdOrFail: typeof utilModule.getCxIdOrFail;

  beforeAll(() => {
    originalGetCxIdOrFail = utilModule.getCxIdOrFail;
    getCxIdOrFailSpy = jest.spyOn(utilModule, "getCxIdOrFail");
    getFacilityOrFailSpy = jest.spyOn(getFacilityModule, "getFacilityOrFail");
  });

  afterEach(() => {
    jest.clearAllMocks();
    getCxIdOrFailSpy.mockImplementation(originalGetCxIdOrFail);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe("params context (id from path)", () => {
    it("sets req.facility, req.cxId, req.id and calls next when params.id and cxId are valid", async () => {
      const cxId = faker.string.uuid();
      const facilityId = faker.string.uuid();
      const facility = makeFacility({ id: facilityId, cxId });
      getCxIdOrFailSpy.mockReturnValue(cxId);
      getFacilityOrFailSpy.mockResolvedValue(facility);

      const req = mockRequest({
        cxId,
        params: { id: facilityId },
        query: {},
      });
      const res = mockResponse();
      const nextFn = jest.fn() as unknown as NextFunction;

      await facilityAuthorization("params")(req, res, nextFn);

      expect(getFacilityOrFailSpy).toHaveBeenCalledWith({
        id: facilityId,
        cxId,
      });
      expect(req.facility).toBe(facility);
      expect(req.cxId).toBe(cxId);
      expect(req.id).toBe(facilityId);
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

      await runMiddlewareAndErrorHandler(facilityAuthorization("params"), req, res);

      expect(res.status).toHaveBeenCalledWith(httpStatus.BAD_REQUEST);
      expect(getFacilityOrFailSpy).not.toHaveBeenCalled();
    });

    it("returns 400 when params.id is invalid UUID", async () => {
      const req = mockRequest({
        params: { id: INVALID_UUID },
        query: {},
      });
      const res = mockResponse();

      await runMiddlewareAndErrorHandler(facilityAuthorization("params"), req, res);

      expect(res.status).toHaveBeenCalledWith(httpStatus.BAD_REQUEST);
      expect(getFacilityOrFailSpy).not.toHaveBeenCalled();
    });

    it("returns 400 when params.id is missing", async () => {
      getCxIdOrFailSpy.mockReturnValue(faker.string.uuid());
      const req = mockRequest({ params: {}, query: {} });
      const res = mockResponse();

      await runMiddlewareAndErrorHandler(facilityAuthorization("params"), req, res);

      expect(res.status).toHaveBeenCalledWith(httpStatus.BAD_REQUEST);
      expect(getFacilityOrFailSpy).not.toHaveBeenCalled();
    });

    it("returns 404 when getFacilityOrFail throws NotFoundError", async () => {
      const cxId = faker.string.uuid();
      const facilityId = faker.string.uuid();
      getCxIdOrFailSpy.mockReturnValue(cxId);
      getFacilityOrFailSpy.mockRejectedValue(
        new NotFoundError("Could not find facility", undefined, {
          facilityId,
        })
      );

      const req = mockRequest({
        cxId,
        params: { id: facilityId },
        query: {},
      });
      const res = mockResponse();

      await runMiddlewareAndErrorHandler(facilityAuthorization("params"), req, res);

      expect(res.status).toHaveBeenCalledWith(httpStatus.NOT_FOUND);
    });
  });

  describe("query context (facilityId from query)", () => {
    it("sets req.facility, req.cxId, req.id and calls next when query.facilityId and cxId are valid", async () => {
      const cxId = faker.string.uuid();
      const facilityId = faker.string.uuid();
      const facility = makeFacility({ id: facilityId, cxId });
      getCxIdOrFailSpy.mockReturnValue(cxId);
      getFacilityOrFailSpy.mockResolvedValue(facility);

      const req = mockRequest({
        cxId,
        params: {},
        query: { facilityId },
      });
      const res = mockResponse();
      const nextFn = jest.fn() as unknown as NextFunction;

      await facilityAuthorization("query")(req, res, nextFn);

      expect(getFacilityOrFailSpy).toHaveBeenCalledWith({
        id: facilityId,
        cxId,
      });
      expect(req.facility).toBe(facility);
      expect(req.cxId).toBe(cxId);
      expect(req.id).toBe(facilityId);
      expect(nextFn).toHaveBeenCalledWith();
    });

    it("returns 400 when query.facilityId is invalid UUID", async () => {
      const req = mockRequest({
        params: {},
        query: { facilityId: INVALID_UUID },
      });
      const res = mockResponse();

      await runMiddlewareAndErrorHandler(facilityAuthorization("query"), req, res);

      expect(res.status).toHaveBeenCalledWith(httpStatus.BAD_REQUEST);
      expect(getFacilityOrFailSpy).not.toHaveBeenCalled();
    });

    it("returns 400 when query.facilityId is missing", async () => {
      const req = mockRequest({ params: {}, query: {} });
      const res = mockResponse();

      await runMiddlewareAndErrorHandler(facilityAuthorization("query"), req, res);

      expect(res.status).toHaveBeenCalledWith(httpStatus.BAD_REQUEST);
      expect(getFacilityOrFailSpy).not.toHaveBeenCalled();
    });
  });
});

describe("getFacilityInfoOrFail", () => {
  it("returns facility, cxId, and id when all are set on request", () => {
    const facility = makeFacility();
    const cxId = faker.string.uuid();
    const id = faker.string.uuid();
    const req = mockRequest({
      facility: facility as Request["facility"],
      cxId,
      id,
    });

    const result = getFacilityInfoOrFail(req);

    expect(result).toEqual({ facility, cxId, id });
  });

  it("throws when facility is missing", () => {
    const req = mockRequest({
      facility: undefined,
      cxId: faker.string.uuid(),
      id: faker.string.uuid(),
    });

    expect(() => getFacilityInfoOrFail(req)).toThrow("Missing facility information");
  });

  it("throws when cxId is missing", () => {
    const req = mockRequest({
      facility: makeFacility() as Request["facility"],
      cxId: undefined,
      id: faker.string.uuid(),
    });

    expect(() => getFacilityInfoOrFail(req)).toThrow("Missing facility information");
  });

  it("throws when id is missing", () => {
    const req = mockRequest({
      facility: makeFacility() as Request["facility"],
      cxId: faker.string.uuid(),
      id: undefined,
    });

    expect(() => getFacilityInfoOrFail(req)).toThrow("Missing facility information");
  });
});
